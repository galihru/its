import java.nio.charset.StandardCharsets
import java.nio.file.{Files, Path, Paths, StandardOpenOption}
import java.util.Locale
import scala.util.control.NonFatal

final case class TrafficSignalSnapshot(
  color: String,
  startedAt: Long,
  durationSec: Int,
  source: String,
  gpioBackend: String,
  gpioReady: Boolean,
  gpioNote: String
)

object TrafficSignalController {
  def fromEnv(vehicleCount: () => Int): TrafficSignalController = {
    val enabled = env("ITS_GPIO_ENABLED", "true").toLowerCase(Locale.ROOT) != "false"
    val pins = TrafficPins(
      red = envInt("ITS_GPIO_RED_PIN", 17),
      yellow = envInt("ITS_GPIO_YELLOW_PIN", 27),
      green = envInt("ITS_GPIO_GREEN_PIN", 22)
    )
    val activeLow = env("ITS_GPIO_ACTIVE_LOW", "false").toLowerCase(Locale.ROOT) == "true"

    new TrafficSignalController(
      backend = GpioBackend.auto(enabled, pins, activeLow),
      pins = pins,
      vehicleCount = vehicleCount,
      baseRedSec = envInt("ITS_TRAFFIC_RED_SECONDS", 7),
      baseYellowSec = envInt("ITS_TRAFFIC_YELLOW_SECONDS", 3),
      baseGreenSec = envInt("ITS_TRAFFIC_GREEN_SECONDS", 8),
      maxGreenExtraSec = envInt("ITS_TRAFFIC_MAX_GREEN_EXTRA_SECONDS", 20),
      vehiclesPerGreenSecond = math.max(1, envInt("ITS_TRAFFIC_VEHICLES_PER_GREEN_SECOND", 3)),
      selfTestEnabled = env("ITS_GPIO_SELF_TEST", "true").toLowerCase(Locale.ROOT) != "false",
      selfTestSec = math.max(1, envInt("ITS_GPIO_SELF_TEST_SECONDS", 2)),
      enabled = enabled
    )
  }

  private def env(name: String, fallback: String): String = {
    val value = System.getenv(name)
    if (value == null || value.trim.isEmpty) fallback else value.trim
  }

  private def envInt(name: String, fallback: Int): Int =
    try env(name, fallback.toString).toInt
    catch { case _: NumberFormatException => fallback }
}

final class TrafficSignalController(
  backend: GpioBackend,
  pins: TrafficPins,
  vehicleCount: () => Int,
  baseRedSec: Int,
  baseYellowSec: Int,
  baseGreenSec: Int,
  maxGreenExtraSec: Int,
  vehiclesPerGreenSecond: Int,
  selfTestEnabled: Boolean,
  selfTestSec: Int,
  enabled: Boolean
) {
  @volatile private var running = false
  @volatile private var latest = TrafficSignalSnapshot(
    color = "red",
    startedAt = System.currentTimeMillis(),
    durationSec = math.max(1, baseRedSec),
    source = if (enabled) "adaptive-yolo" else "disabled",
    gpioBackend = backend.name,
    gpioReady = backend.ready,
    gpioNote = backend.note
  )

  private var thread: Thread = _

  def snapshot(): TrafficSignalSnapshot = latest

  def start(): Unit = synchronized {
    if (running) return
    running = true
    backend.initialize()
    thread = new Thread(new Runnable {
      override def run(): Unit = loop()
    }, "its-traffic-signal")
    thread.setDaemon(true)
    thread.start()
  }

  def stop(): Unit = {
    running = false
    try {
      if (thread != null) thread.interrupt()
    } catch {
      case NonFatal(_) => ()
    }
    try backend.off()
    catch { case NonFatal(_) => () }
  }

  private def loop(): Unit = {
    if (selfTestEnabled) {
      println(s"[${java.time.LocalDateTime.now()}] GPIO self-test starting: red=${pins.red}, yellow=${pins.yellow}, green=${pins.green}, backend=${backend.name}")
      runPhase("red", selfTestSec, "startup-test")
      runPhase("yellow", selfTestSec, "startup-test")
      runPhase("green", selfTestSec, "startup-test")
      println(s"[${java.time.LocalDateTime.now()}] GPIO self-test finished: ready=${backend.ready}, note=${backend.note}")
    }

    while (running) {
      runPhase("red", redDurationSec())
      runPhase("green", greenDurationSec())
      runPhase("yellow", math.max(1, baseYellowSec))
    }
  }

  private def redDurationSec(): Int = {
    val detected = safeVehicleCount()
    val reduction = math.min(math.max(0, baseRedSec / 2), detected / math.max(1, vehiclesPerGreenSecond * 2))
    math.max(3, baseRedSec - reduction)
  }

  private def greenDurationSec(): Int = {
    val detected = safeVehicleCount()
    val extra = math.min(math.max(0, maxGreenExtraSec), detected / vehiclesPerGreenSecond)
    math.max(3, baseGreenSec + extra)
  }

  private def safeVehicleCount(): Int =
    try math.max(0, vehicleCount())
    catch { case NonFatal(_) => 0 }

  private def runPhase(color: String, durationSec: Int, source: String = "adaptive-yolo"): Unit = {
    if (!running) return
    try backend.setColor(color)
    catch {
      case NonFatal(ex) =>
        println(s"[${java.time.LocalDateTime.now()}] GPIO setColor failed ($color): ${ex.getMessage}")
    }
    latest = TrafficSignalSnapshot(
      color = color,
      startedAt = System.currentTimeMillis(),
      durationSec = durationSec,
      source = source,
      gpioBackend = backend.name,
      gpioReady = backend.ready,
      gpioNote = backend.note
    )

    var remainingMs = durationSec * 1000L
    while (running && remainingMs > 0) {
      val step = math.min(250L, remainingMs)
      try Thread.sleep(step)
      catch { case _: InterruptedException => return }
      remainingMs -= step
    }
  }
}

final case class TrafficPins(red: Int, yellow: Int, green: Int)

trait GpioBackend {
  def name: String
  def ready: Boolean
  def note: String
  def initialize(): Unit
  def setColor(color: String): Unit

  final def off(): Unit = {
    writeAll(red = false, yellow = false, green = false)
  }

  protected def writeAll(red: Boolean, yellow: Boolean, green: Boolean): Unit
}

object GpioBackend {
  def auto(enabled: Boolean, pins: TrafficPins, activeLow: Boolean): GpioBackend = {
    if (!enabled) return new NoopGpioBackend("disabled", pins)
    if (!isLinux) return new NoopGpioBackend("not-linux", pins)

    commandPath("pinctrl")
      .map(path => new PinctrlGpioBackend(path, pins, activeLow): GpioBackend)
      .orElse(commandPath("raspi-gpio").map(path => new RaspiGpioBackend(path, pins, activeLow): GpioBackend))
      .getOrElse {
        if (Files.exists(Paths.get("/sys/class/gpio/export"))) new SysfsGpioBackend(pins, activeLow)
        else new NoopGpioBackend("no-gpio-backend", pins)
      }
  }

  private def isLinux: Boolean =
    System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("linux")

  private def commandPath(name: String): Option[String] = {
    val candidates = Seq(
      s"/usr/bin/$name",
      s"/usr/local/bin/$name",
      s"/bin/$name"
    ) ++ Option(System.getenv("PATH")).toSeq
      .flatMap(_.split(java.io.File.pathSeparator).toSeq)
      .map(path => Paths.get(path, name).toString)

    candidates.find(path => Files.isExecutable(Paths.get(path)))
  }
}

abstract class CommandGpioBackend(command: String, pins: TrafficPins, activeLow: Boolean) extends GpioBackend {
  @volatile private var lastError: String = ""

  override def ready: Boolean = lastError.isEmpty
  override def note: String =
    if (lastError.nonEmpty) lastError
    else s"pins red=${pins.red} yellow=${pins.yellow} green=${pins.green} activeLow=$activeLow"

  override def initialize(): Unit = {
    writeAll(red = false, yellow = false, green = false)
  }

  override def setColor(color: String): Unit = color match {
    case "red"    => writeAll(red = true, yellow = false, green = false)
    case "yellow" => writeAll(red = false, yellow = true, green = false)
    case "green"  => writeAll(red = false, yellow = false, green = true)
    case _        => writeAll(red = false, yellow = false, green = false)
  }

  override protected def writeAll(red: Boolean, yellow: Boolean, green: Boolean): Unit = {
    lastError = ""
    writePin(pins.red, red)
    writePin(pins.yellow, yellow)
    writePin(pins.green, green)
  }

  protected def pinArgs(pin: Int, high: Boolean): Seq[String]

  private def writePin(pin: Int, high: Boolean): Unit = {
    val physicalHigh = if (activeLow) !high else high
    try {
      val process = new ProcessBuilder((Seq(command) ++ pinArgs(pin, physicalHigh)): _*)
        .redirectErrorStream(true)
        .start()
      val exitCode = process.waitFor()
      if (exitCode != 0) {
        val output = new String(process.getInputStream.readAllBytes(), StandardCharsets.UTF_8).trim
        recordError(s"GPIO command failed ($name pin=$pin high=$physicalHigh): $output")
      }
    } catch {
      case NonFatal(ex) =>
        recordError(s"GPIO command error ($name pin=$pin high=$physicalHigh): ${ex.getMessage}")
    }
  }

  private def recordError(message: String): Unit = {
    lastError = message
    println(s"[${java.time.LocalDateTime.now()}] $message")
  }
}

final class PinctrlGpioBackend(command: String, pins: TrafficPins, activeLow: Boolean)
  extends CommandGpioBackend(command, pins, activeLow) {
  override def name: String = "pinctrl"
  override protected def pinArgs(pin: Int, high: Boolean): Seq[String] =
    Seq("set", pin.toString, "op", if (high) "dh" else "dl")
}

final class RaspiGpioBackend(command: String, pins: TrafficPins, activeLow: Boolean)
  extends CommandGpioBackend(command, pins, activeLow) {
  override def name: String = "raspi-gpio"
  override protected def pinArgs(pin: Int, high: Boolean): Seq[String] =
    Seq("set", pin.toString, "op", if (high) "dh" else "dl")
}

final class SysfsGpioBackend(pins: TrafficPins, activeLow: Boolean) extends GpioBackend {
  @volatile private var lastError: String = ""

  override def name: String = "sysfs"
  override def ready: Boolean = lastError.isEmpty
  override def note: String =
    if (lastError.nonEmpty) lastError
    else s"pins red=${pins.red} yellow=${pins.yellow} green=${pins.green} activeLow=$activeLow"

  override def initialize(): Unit = {
    lastError = ""
    Seq(pins.red, pins.yellow, pins.green).foreach { pin =>
      exportPin(pin)
      write(Paths.get(s"/sys/class/gpio/gpio$pin/direction"), "out")
      writePin(pin, high = false)
    }
  }

  override def setColor(color: String): Unit = color match {
    case "red"    => writeAll(red = true, yellow = false, green = false)
    case "yellow" => writeAll(red = false, yellow = true, green = false)
    case "green"  => writeAll(red = false, yellow = false, green = true)
    case _        => writeAll(red = false, yellow = false, green = false)
  }

  override protected def writeAll(red: Boolean, yellow: Boolean, green: Boolean): Unit = {
    lastError = ""
    writePin(pins.red, red)
    writePin(pins.yellow, yellow)
    writePin(pins.green, green)
  }

  private def exportPin(pin: Int): Unit = {
    val gpioDir = Paths.get(s"/sys/class/gpio/gpio$pin")
    if (!Files.exists(gpioDir)) {
      write(Paths.get("/sys/class/gpio/export"), pin.toString)
      Thread.sleep(100)
    }
  }

  private def writePin(pin: Int, high: Boolean): Unit = {
    val physicalHigh = if (activeLow) !high else high
    write(Paths.get(s"/sys/class/gpio/gpio$pin/value"), if (physicalHigh) "1" else "0")
  }

  private def write(path: Path, value: String): Unit =
    try Files.writeString(path, value, StandardCharsets.UTF_8, StandardOpenOption.WRITE)
    catch {
      case NonFatal(ex) =>
        lastError = s"GPIO sysfs write failed: $path: ${ex.getMessage}"
        println(s"[${java.time.LocalDateTime.now()}] $lastError")
    }
}

final class NoopGpioBackend(reason: String, pins: TrafficPins) extends GpioBackend {
  override def name: String = s"noop-$reason"
  override def ready: Boolean = false
  override def note: String = s"GPIO disabled: $reason (red=${pins.red}, yellow=${pins.yellow}, green=${pins.green})"
  override def initialize(): Unit =
    println(s"[${java.time.LocalDateTime.now()}] $note")
  override def setColor(color: String): Unit = ()
  override protected def writeAll(red: Boolean, yellow: Boolean, green: Boolean): Unit = ()
}
