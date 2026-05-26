import java.nio.file.{Files, Paths}
import java.util.Locale
import scala.util.control.NonFatal

final case class VehicleBreakdown(
  car: Int = 0,
  motorcycle: Int = 0,
  bus: Int = 0,
  truck: Int = 0,
  bicycle: Int = 0
) {
  def total: Int = car + motorcycle + bus + truck + bicycle

  def add(label: String): VehicleBreakdown = label.toLowerCase(Locale.ROOT) match {
    case "car"        => copy(car = car + 1)
    case "motorcycle" => copy(motorcycle = motorcycle + 1)
    case "bus"        => copy(bus = bus + 1)
    case "truck"      => copy(truck = truck + 1)
    case "bicycle"    => copy(bicycle = bicycle + 1)
    case _            => this
  }
}

final case class YoloDetection(
  label: String,
  confidence: Double,
  x: Double,
  y: Double,
  width: Double,
  height: Double
)

final case class YoloFrameSummary(
  status: String,
  note: String,
  updatedAt: Long,
  fps: Double,
  frameWidth: Int,
  frameHeight: Int,
  objectCount: Int,
  vehicleCount: Int,
  vehicleBreakdown: VehicleBreakdown,
  detections: Seq[YoloDetection]
)

final case class YoloConfig(
  enabled: Boolean,
  modelPath: String,
  cameraSource: String,
  inputSize: Int,
  confidenceThreshold: Double,
  nmsThreshold: Double,
  sampleEveryMs: Long,
  maxDetections: Int,
  detectionClassNames: Set[String],
  vehicleClassNames: Set[String]
)

object YoloConfig {
  def fromEnv(defaultCameraSource: String): YoloConfig = {
    val modelPath = env("ITS_YOLO_MODEL_PATH", "/home/raspberry5its/models/yolo26n.onnx")
    val cameraSource = env(
      "ITS_YOLO_CAMERA_SOURCE",
      env("ITS_CAMERA_SOURCE", env("ITS_CAMERA_DEVICE", defaultCameraSource))
    )
    val classes = env("ITS_YOLO_VEHICLE_CLASSES", "car,motorcycle,bus,truck,bicycle")
      .split(",")
      .map(_.trim.toLowerCase(Locale.ROOT))
      .filter(_.nonEmpty)
      .toSet
    val detectionClasses = env("ITS_YOLO_DETECTION_CLASSES", "")
      .split(",")
      .map(_.trim.toLowerCase(Locale.ROOT))
      .filter(_.nonEmpty)
      .toSet

    YoloConfig(
      enabled = env("ITS_YOLO_ENABLED", "true").toLowerCase(Locale.ROOT) != "false",
      modelPath = modelPath,
      cameraSource = if (cameraSource.nonEmpty) cameraSource else "/dev/video0",
      inputSize = math.max(160, envInt("ITS_YOLO_INPUT_SIZE", 640)),
      confidenceThreshold = clamp(envDouble("ITS_YOLO_CONFIDENCE", 0.25), 0.01, 0.99),
      nmsThreshold = clamp(envDouble("ITS_YOLO_NMS", 0.45), 0.01, 0.99),
      sampleEveryMs = math.max(100L, envInt("ITS_YOLO_SAMPLE_MS", 1000).toLong),
      maxDetections = math.max(1, envInt("ITS_YOLO_MAX_DETECTIONS", 80)),
      detectionClassNames = detectionClasses,
      vehicleClassNames = if (classes.nonEmpty) classes else Set("car", "motorcycle", "bus", "truck", "bicycle")
    )
  }

  private def env(name: String, fallback: String): String = {
    val value = System.getenv(name)
    if (value == null || value.trim.isEmpty) fallback else value.trim
  }

  private def envInt(name: String, fallback: Int): Int =
    try env(name, fallback.toString).toInt
    catch { case _: NumberFormatException => fallback }

  private def envDouble(name: String, fallback: Double): Double =
    try env(name, fallback.toString).toDouble
    catch { case _: NumberFormatException => fallback }

  private def clamp(value: Double, min: Double, max: Double): Double =
    math.max(min, math.min(max, value))
}

trait YoloDetector {
  def start(): Unit
  def snapshot(): YoloFrameSummary
  def close(): Unit
}

object YoloDetector {
  val CocoLabels: Vector[String] = Vector(
    "person", "bicycle", "car", "motorcycle", "airplane", "bus", "train", "truck", "boat",
    "traffic light", "fire hydrant", "stop sign", "parking meter", "bench", "bird", "cat",
    "dog", "horse", "sheep", "cow", "elephant", "bear", "zebra", "giraffe", "backpack",
    "umbrella", "handbag", "tie", "suitcase", "frisbee", "skis", "snowboard", "sports ball",
    "kite", "baseball bat", "baseball glove", "skateboard", "surfboard", "tennis racket",
    "bottle", "wine glass", "cup", "fork", "knife", "spoon", "bowl", "banana", "apple",
    "sandwich", "orange", "broccoli", "carrot", "hot dog", "pizza", "donut", "cake",
    "chair", "couch", "potted plant", "bed", "dining table", "toilet", "tv", "laptop",
    "mouse", "remote", "keyboard", "cell phone", "microwave", "oven", "toaster", "sink",
    "refrigerator", "book", "clock", "vase", "scissors", "teddy bear", "hair drier",
    "toothbrush"
  )

  def create(config: YoloConfig): YoloDetector =
    if (!config.enabled) new DisabledYoloDetector("disabled")
    else new OpenCvYoloDetector(config)

  def empty(status: String, note: String): YoloFrameSummary =
    YoloFrameSummary(status, note, System.currentTimeMillis(), 0.0, 0, 0, 0, 0, VehicleBreakdown(), Seq.empty)
}

final class DisabledYoloDetector(reason: String) extends YoloDetector {
  private val current = YoloDetector.empty("disabled", reason)
  override def start(): Unit = ()
  override def snapshot(): YoloFrameSummary = current
  override def close(): Unit = ()
}

final class OpenCvYoloDetector(config: YoloConfig) extends YoloDetector {
  @volatile private var running = false
  @volatile private var latest = YoloDetector.empty("starting", "YOLO detector starting")
  private var thread: Thread = _

  override def start(): Unit = synchronized {
    if (running) return
    running = true
    thread = new Thread(new Runnable {
      override def run(): Unit = loop()
    }, "its-yolo-detector")
    thread.setDaemon(true)
    thread.start()
  }

  override def snapshot(): YoloFrameSummary = latest

  override def close(): Unit = {
    running = false
    try {
      if (thread != null) thread.interrupt()
    } catch {
      case NonFatal(_) => ()
    }
  }

  private def loop(): Unit = {
    if (!Files.isRegularFile(Paths.get(config.modelPath))) {
      latest = YoloDetector.empty("missing-model", s"YOLO model not found: ${config.modelPath}")
      println(s"[${java.time.LocalDateTime.now()}] ${latest.note}")
      return
    }

    var runtime: OpenCvYoloRuntime = null
    try {
      runtime = OpenCvYoloRuntime.open(config)
      latest = YoloDetector.empty("warming-up", s"YOLO ready on ${config.cameraSource}")
      while (running) {
        val started = System.nanoTime()
        latest = runtime.detectFrame()
        val elapsedMs = math.max(1L, (System.nanoTime() - started) / 1000000L)
        val sleepMs = math.max(0L, config.sampleEveryMs - elapsedMs)
        if (sleepMs > 0) Thread.sleep(sleepMs)
      }
    } catch {
      case _: InterruptedException => ()
      case NonFatal(ex) =>
        latest = YoloDetector.empty("error", ex.getMessage)
        println(s"[${java.time.LocalDateTime.now()}] YOLO detector error: ${ex.getMessage}")
    } finally {
      if (runtime != null) runtime.close()
    }
  }
}

final class OpenCvYoloRuntime private (
  config: YoloConfig,
  refs: OpenCvRefs,
  capture: AnyRef,
  net: AnyRef
) {
  def detectFrame(): YoloFrameSummary = {
    val frame = refs.newMat()
    try {
      val readOk = refs.invokeBoolean(capture, "read", refs.matClass, frame)
      val empty = refs.invokeBoolean(frame, "empty")
      if (!readOk || empty) {
        return YoloDetector.empty("camera-unavailable", s"Cannot read camera source: ${config.cameraSource}")
      }

      val frameWidth = refs.invokeInt(frame, "cols")
      val frameHeight = refs.invokeInt(frame, "rows")
      val started = System.nanoTime()
      val blob = refs.blobFromImage(frame, config.inputSize)
      val output =
        try {
          refs.invokeVoid(net, "setInput", refs.matClass, blob)
          refs.invoke(net, "forward").asInstanceOf[AnyRef]
        } finally {
          refs.release(blob)
        }

      try {
        val detections = refs.extractDetections(output, config, frameWidth, frameHeight)
        val fps = 1000000000.0 / math.max(1L, System.nanoTime() - started)
        val vehicleDetections = detections.filter(det => config.vehicleClassNames.contains(det.label.toLowerCase(Locale.ROOT)))
        val breakdown = vehicleDetections.foldLeft(VehicleBreakdown())((acc, det) => acc.add(det.label))
        YoloFrameSummary(
          status = "online",
          note = "YOLO realtime detection active",
          updatedAt = System.currentTimeMillis(),
          fps = fps,
          frameWidth = frameWidth,
          frameHeight = frameHeight,
          objectCount = detections.length,
          vehicleCount = breakdown.total,
          vehicleBreakdown = breakdown,
          detections = detections.take(config.maxDetections)
        )
      } finally {
        refs.release(output)
      }
    } catch {
      case NonFatal(ex) =>
        YoloDetector.empty("error", ex.getMessage)
    } finally {
      refs.release(frame)
    }
  }

  def close(): Unit = {
    refs.invokeVoid(capture, "release")
  }
}

object OpenCvYoloRuntime {
  def open(config: YoloConfig): OpenCvYoloRuntime = {
    val refs = OpenCvRefs.load()
    val capture = refs.openCapture(config.cameraSource)
    if (!refs.invokeBoolean(capture, "isOpened")) {
      throw new IllegalStateException(s"OpenCV cannot open camera source: ${config.cameraSource}")
    }
    val net = refs.readNetFromOnnx(config.modelPath)
    new OpenCvYoloRuntime(config, refs, capture, net)
  }
}

final class OpenCvRefs private (
  val matClass: Class[_],
  private val sizeClass: Class[_],
  private val scalarClass: Class[_],
  private val dnnClass: Class[_],
  private val videoCaptureClass: Class[_]
) {
  private val matCtor = matClass.getConstructor()
  private val sizeCtor = sizeClass.getConstructor(java.lang.Double.TYPE, java.lang.Double.TYPE)
  private val scalarCtor = scalarClass.getConstructor(java.lang.Double.TYPE, java.lang.Double.TYPE, java.lang.Double.TYPE)

  def newMat(): AnyRef = matCtor.newInstance().asInstanceOf[AnyRef]

  def openCapture(source: String): AnyRef = {
    val trimmed = source.trim
    val capture =
      if (trimmed.matches("^\\d+$")) {
        videoCaptureClass.getConstructor(java.lang.Integer.TYPE).newInstance(Int.box(trimmed.toInt)).asInstanceOf[AnyRef]
      } else {
        videoCaptureClass.getConstructor(classOf[String]).newInstance(trimmed).asInstanceOf[AnyRef]
      }
    capture
  }

  def readNetFromOnnx(path: String): AnyRef =
    dnnClass.getMethod("readNetFromONNX", classOf[String]).invoke(null, path).asInstanceOf[AnyRef]

  def blobFromImage(frame: AnyRef, inputSize: Int): AnyRef = {
    val size = sizeCtor.newInstance(Double.box(inputSize.toDouble), Double.box(inputSize.toDouble)).asInstanceOf[AnyRef]
    val mean = scalarCtor.newInstance(Double.box(0.0), Double.box(0.0), Double.box(0.0)).asInstanceOf[AnyRef]
    dnnClass
      .getMethod(
        "blobFromImage",
        matClass,
        java.lang.Double.TYPE,
        sizeClass,
        scalarClass,
        java.lang.Boolean.TYPE,
        java.lang.Boolean.TYPE
      )
      .invoke(null, frame, Double.box(1.0 / 255.0), size, mean, Boolean.box(true), Boolean.box(false))
      .asInstanceOf[AnyRef]
  }

  def extractDetections(output: AnyRef, config: YoloConfig, frameWidth: Int, frameHeight: Int): Seq[YoloDetection] = {
    val data = matData(output)
    if (data.isEmpty) return Seq.empty

    val dims = invokeInt(output, "dims")
    val shape = (0 until dims).map(i => invokeInt(output, "size", classOf[Int], Int.box(i))).toVector

    val rawDetections =
      if (shape.length >= 3) parseThreeDimensionalOutput(data, shape, config, frameWidth, frameHeight)
      else parseTwoDimensionalOutput(data, invokeInt(output, "rows"), invokeInt(output, "cols"), config, frameWidth, frameHeight)

    nonMaxSuppression(rawDetections, config.nmsThreshold)
  }

  private def parseThreeDimensionalOutput(
    data: Array[Float],
    shape: Vector[Int],
    config: YoloConfig,
    frameWidth: Int,
    frameHeight: Int
  ): Seq[YoloDetection] = {
    val a = shape(shape.length - 2)
    val b = shape(shape.length - 1)
    if (a > b) {
      parseRowsOutput(data, rows = a, attrs = b, (row, attr) => row * b + attr, config, frameWidth, frameHeight)
    } else {
      parseRowsOutput(data, rows = b, attrs = a, (row, attr) => attr * b + row, config, frameWidth, frameHeight)
    }
  }

  private def parseTwoDimensionalOutput(
    data: Array[Float],
    rows: Int,
    cols: Int,
    config: YoloConfig,
    frameWidth: Int,
    frameHeight: Int
  ): Seq[YoloDetection] =
    parseRowsOutput(data, rows, cols, (row, attr) => row * cols + attr, config, frameWidth, frameHeight)

  private def parseRowsOutput(
    data: Array[Float],
    rows: Int,
    attrs: Int,
    index: (Int, Int) => Int,
    config: YoloConfig,
    frameWidth: Int,
    frameHeight: Int
  ): Seq[YoloDetection] = {
    if (rows <= 0 || attrs < 6) return Seq.empty
    val classStart = if (attrs >= 85) 5 else 4
    val hasObjectness = attrs >= 85

    (0 until rows).flatMap { row =>
      val cx = read(data, index(row, 0))
      val cy = read(data, index(row, 1))
      val w = read(data, index(row, 2))
      val h = read(data, index(row, 3))
      val objectness = if (hasObjectness) read(data, index(row, 4)) else 1.0

      var bestClass = -1
      var bestScore = 0.0
      var attr = classStart
      while (attr < attrs) {
        val score = read(data, index(row, attr)) * objectness
        if (score > bestScore) {
          bestScore = score
          bestClass = attr - classStart
        }
        attr += 1
      }

      val label = if (bestClass >= 0 && bestClass < YoloDetector.CocoLabels.length) {
        YoloDetector.CocoLabels(bestClass)
      } else {
        s"class-$bestClass"
      }

      val labelKey = label.toLowerCase(Locale.ROOT)
      if (
        bestScore < config.confidenceThreshold ||
        (config.detectionClassNames.nonEmpty && !config.detectionClassNames.contains(labelKey))
      ) None
      else Some(toDetection(label, bestScore, cx, cy, w, h, frameWidth, frameHeight, config.inputSize))
    }
  }

  private def toDetection(
    label: String,
    confidence: Double,
    cx: Double,
    cy: Double,
    w: Double,
    h: Double,
    frameWidth: Int,
    frameHeight: Int,
    inputSize: Int
  ): YoloDetection = {
    val normalized = Seq(cx, cy, w, h).forall(v => v >= 0.0 && v <= 1.5)
    val scaleX = if (normalized) frameWidth.toDouble else frameWidth.toDouble / inputSize.toDouble
    val scaleY = if (normalized) frameHeight.toDouble else frameHeight.toDouble / inputSize.toDouble
    val boxW = clamp(w * scaleX, 0.0, frameWidth.toDouble)
    val boxH = clamp(h * scaleY, 0.0, frameHeight.toDouble)
    val x = clamp((cx * scaleX) - boxW / 2.0, 0.0, frameWidth.toDouble)
    val y = clamp((cy * scaleY) - boxH / 2.0, 0.0, frameHeight.toDouble)
    YoloDetection(label, confidence, x, y, boxW, boxH)
  }

  private def nonMaxSuppression(detections: Seq[YoloDetection], iouThreshold: Double): Seq[YoloDetection] = {
    detections
      .sortBy(d => -d.confidence)
      .foldLeft(Vector.empty[YoloDetection]) { (kept, candidate) =>
        val overlaps = kept.exists(existing => existing.label == candidate.label && iou(existing, candidate) > iouThreshold)
        if (overlaps) kept else kept :+ candidate
      }
  }

  private def iou(a: YoloDetection, b: YoloDetection): Double = {
    val ax2 = a.x + a.width
    val ay2 = a.y + a.height
    val bx2 = b.x + b.width
    val by2 = b.y + b.height
    val interX1 = math.max(a.x, b.x)
    val interY1 = math.max(a.y, b.y)
    val interX2 = math.min(ax2, bx2)
    val interY2 = math.min(ay2, by2)
    val interW = math.max(0.0, interX2 - interX1)
    val interH = math.max(0.0, interY2 - interY1)
    val interArea = interW * interH
    val unionArea = a.width * a.height + b.width * b.height - interArea
    if (unionArea <= 0.0) 0.0 else interArea / unionArea
  }

  private def matData(mat: AnyRef): Array[Float] = {
    val total = invokeLong(mat, "total")
    val channels = invokeInt(mat, "channels")
    val count = math.max(0L, total * channels.toLong).toInt
    val data = new Array[Float](count)
    if (count > 0) {
      matClass.getMethod("get", classOf[Int], classOf[Int], classOf[Array[Float]])
        .invoke(mat, Int.box(0), Int.box(0), data)
    }
    data
  }

  def release(value: AnyRef): Unit =
    try invokeVoid(value, "release")
    catch { case NonFatal(_) => () }

  def invoke(target: AnyRef, name: String): Any =
    target.getClass.getMethod(name).invoke(target)

  def invokeVoid(target: AnyRef, name: String): Unit =
    target.getClass.getMethod(name).invoke(target)

  def invokeVoid(target: AnyRef, name: String, argClass: Class[_], arg: AnyRef): Unit =
    target.getClass.getMethod(name, argClass).invoke(target, arg)

  def invokeInt(target: AnyRef, name: String): Int =
    invoke(target, name).asInstanceOf[java.lang.Integer].intValue()

  def invokeInt(target: AnyRef, name: String, argClass: Class[_], arg: AnyRef): Int =
    target.getClass.getMethod(name, argClass).invoke(target, arg).asInstanceOf[java.lang.Integer].intValue()

  def invokeLong(target: AnyRef, name: String): Long =
    invoke(target, name).asInstanceOf[java.lang.Long].longValue()

  def invokeBoolean(target: AnyRef, name: String): Boolean =
    invoke(target, name).asInstanceOf[java.lang.Boolean].booleanValue()

  def invokeBoolean(target: AnyRef, name: String, argClass: Class[_], arg: AnyRef): Boolean =
    target.getClass.getMethod(name, argClass).invoke(target, arg).asInstanceOf[java.lang.Boolean].booleanValue()

  private def read(data: Array[Float], index: Int): Double =
    if (index >= 0 && index < data.length) data(index).toDouble else 0.0

  private def clamp(value: Double, min: Double, max: Double): Double =
    math.max(min, math.min(max, value))
}

object OpenCvRefs {
  def load(): OpenCvRefs = {
    val coreClass = Class.forName("org.opencv.core.Core")
    val nativeName = coreClass.getField("NATIVE_LIBRARY_NAME").get(null).asInstanceOf[String]
    try System.loadLibrary(nativeName)
    catch {
      case _: UnsatisfiedLinkError =>
        val explicit = Option(System.getenv("ITS_OPENCV_NATIVE_LIB")).map(_.trim).filter(_.nonEmpty)
        explicit match {
          case Some(path) => System.load(path)
          case None => throw new UnsatisfiedLinkError(
            s"OpenCV native library not found. Install libopencv-java or set ITS_OPENCV_NATIVE_LIB. Missing: $nativeName"
          )
        }
    }

    new OpenCvRefs(
      matClass = Class.forName("org.opencv.core.Mat"),
      sizeClass = Class.forName("org.opencv.core.Size"),
      scalarClass = Class.forName("org.opencv.core.Scalar"),
      dnnClass = Class.forName("org.opencv.dnn.Dnn"),
      videoCaptureClass = Class.forName("org.opencv.videoio.VideoCapture")
    )
  }
}
