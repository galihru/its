import java.nio.charset.StandardCharsets
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.net.URLEncoder
import java.nio.file.Files
import java.nio.file.Paths
import java.nio.file.StandardOpenOption
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Base64
import java.util.Locale
import java.util.concurrent.TimeUnit

object ItsController {
  private case class GeoLocation(
    lat: Double,
    lng: Double,
    source: String,
    label: String,
    accuracyM: Int
  )

  private val offlineAfterMs      = math.max(60_000, envInt("ITS_OFFLINE_AFTER_MS", 300_000))
  private val staleDeleteAfterMs  = math.max(offlineAfterMs, envInt("ITS_STALE_DELETE_AFTER_MS", 900_000).toLong)
  private val deviceId            = env("ITS_DEVICE_ID",    "raspberry-its")
  private val label               = env("ITS_DEVICE_LABEL", "Raspberry Pi 5 Controller")
  private val status              = env("ITS_STATUS",       "online")
  private val note                = env("ITS_NOTE",         "controller aktif")

  private val fallbackLatitude   = envDouble("ITS_FALLBACK_LATITUDE",  0.0)
  private val fallbackLongitude  = envDouble("ITS_FALLBACK_LONGITUDE", 0.0)
  private val explicitLatitude   = envDoubleOpt("ITS_LATITUDE")
  private val explicitLongitude  = envDoubleOpt("ITS_LONGITUDE")
  private val gpsFallbackLatitude = envDoubleOpt("ITS_GPS_FALLBACK_LATITUDE").orElse(explicitLatitude)
  private val gpsFallbackLongitude = envDoubleOpt("ITS_GPS_FALLBACK_LONGITUDE").orElse(explicitLongitude)
  private val locationMode       = env("ITS_LOCATION_MODE", "ip").toLowerCase(Locale.ROOT)
  private val gpsEnabled         = env("ITS_GPS_ENABLED", "true").toLowerCase(Locale.ROOT) != "false"
  private val gpsdEnabled        = env("ITS_GPSD_ENABLED", "true").toLowerCase(Locale.ROOT) != "false"
  private val gpsDevices         = env("ITS_GPS_DEVICES", "/dev/serial0,/dev/ttyAMA0,/dev/ttyS0,/dev/ttyUSB0")
    .split(",")
    .map(_.trim)
    .filter(_.nonEmpty)
    .toSeq
  private val gpsBaud            = math.max(1200, envInt("ITS_GPS_BAUD", 9600))
  private val gpsReadSeconds     = math.max(1, envInt("ITS_GPS_READ_SECONDS", 2))
  private val gpsCacheMs         = math.max(5_000L, envInt("ITS_GPS_CACHE_SECONDS", 20).toLong * 1000L)
  private var cachedGpsLocation: Option[(Long, GeoLocation)] = None
  private var lastGpsAttemptAt: Long = 0L

  private val intervalSeconds     = math.max(1, envInt("ITS_INTERVAL_SECONDS", 15))
  private val geoRefreshMs        = math.max(5_000L, envInt("ITS_GEO_REFRESH_SECONDS", intervalSeconds).toLong * 1000L)
  private val outputPath          = env("ITS_OUTPUT_PATH", "../web/public/data/its-state.json")
  private val updateStatusPath    = env("ITS_UPDATE_STATUS_PATH", "update-status.json")
  private val ipGeolocationUrls   = env(
    "ITS_IP_GEOLOCATION_URLS",
    "https://ipapi.co/json/,https://ipwho.is/"
  ).split(",").map(_.trim).filter(_.nonEmpty).toSeq
  private val firebaseUrl         = env(
    "ITS_FIREBASE_BASE_URL",
    "https://itstelkom-default-rtdb.asia-southeast1.firebasedatabase.app/devices"
  )
  private val firebaseRootUrl = env("ITS_FIREBASE_ROOT_URL", firebaseRootFromDevicesUrl(firebaseUrl))
  private val firebaseAuth    = env("ITS_FIREBASE_AUTH", "")
  private var firebaseEnabled = env("ITS_FIREBASE_ENABLED", "true").toLowerCase(Locale.ROOT) != "false"
  private val publishOfflineOnShutdown = env("ITS_PUBLISH_OFFLINE_ON_SHUTDOWN", "false").toLowerCase(Locale.ROOT) == "true"
  private var cachedLocation: Option[(Long, GeoLocation)] = None

  private val cameraEnabled    = env("ITS_CAMERA_ENABLED", "true").toLowerCase(Locale.ROOT) != "false"
  private val webrtcEnabled    = env("ITS_WEBRTC_ENABLED", "false").toLowerCase(Locale.ROOT) != "false"
  private val cameraMode       = {
    val requested = env("ITS_CAMERA_MODE", "mjpeg").toLowerCase(Locale.ROOT)
    if (requested == "webrtc" || requested == "mjpeg") requested else "mjpeg"
  }
  private val webrtcSignalPath = env("ITS_WEBRTC_SIGNAL_PATH", s"webrtc/devices/$deviceId").stripPrefix("/").stripSuffix("/")
  private val cameraPublicUrl  = resolveCameraPublicUrl()
  private val snapshotUrl = env("ITS_CAMERA_SNAPSHOT_URL", "")
  private val snapshotIntervalMs = math.max(10_000L, envInt("ITS_SNAPSHOT_INTERVAL_SECONDS", 10).toLong * 1000L)
  private val snapshotMaxBytes = math.max(50_000, envInt("ITS_SNAPSHOT_MAX_BYTES", 350_000))
  @volatile private var lastSnapshotPublishedAt: Long = 0L
  @volatile private var snapshotSlot: Int = 0

  @volatile private var cameraStatus: String = if (cameraEnabled && (cameraPublicUrl.nonEmpty || webrtcEnabled)) "online" else "disabled"
  @volatile private var cameraUpdatedAt: Long = 0L
  @volatile private var cameraError: String = ""

  private val yoloConfig = YoloConfig.fromEnv(defaultCameraSource = resolveYoloCameraFallback())
  private val yoloDetector = YoloDetector.create(yoloConfig)
  private val httpClient = HttpClient.newHttpClient()
  @volatile private var cachedRemoteDemandAt: Long = 0L
  @volatile private var cachedRemoteDemandCount: Int = 0
  private val trafficSignal = TrafficSignalController.fromEnv(() => demandVehicleCount())
  private val lastSeenFormatter = DateTimeFormatter
    .ofPattern("EEEE, dd MMMM yyyy HH:mm:ss")
    .withLocale(new Locale("id", "ID"))
    .withZone(ZoneId.systemDefault())

  def main(args: Array[String]): Unit = {
    initCameraState()
    yoloDetector.start()
    trafficSignal.start()

    val startupLocation = currentLocation()
    println(s"ITS controller started — device=$deviceId lat=${startupLocation.lat} lng=${startupLocation.lng} source=${startupLocation.source} -> $outputPath")
    println(s"Camera mode=$cameraMode enabled=$cameraEnabled webrtc=$webrtcEnabled publicUrl=${if (cameraPublicUrl.nonEmpty) cameraPublicUrl else "(firebase-signaling)"}")
    println(s"YOLO enabled=${yoloConfig.enabled} model=${yoloConfig.modelPath} source=${yoloConfig.cameraSource}")
    Runtime.getRuntime.addShutdownHook(new Thread(() => {
      trafficSignal.stop()
      yoloDetector.close()
      if (publishOfflineOnShutdown) publishOfflineDevice()
    }))
    // Saat startup: cek dan hapus node lama yang masih berisi nested snapshot wrapper
    migrateLegacyFirebaseNode()
    if (args.contains("--once")) {
      Thread.sleep(math.min(1200L, yoloConfig.sampleEveryMs))
      writeSnapshot()
      trafficSignal.stop()
      yoloDetector.close()
      return
    }
    while (true) {
      writeSnapshot()
      Thread.sleep(intervalSeconds * 1000L)
    }
  }

  /**
   * Deteksi node lama di Firebase: devices/{deviceId} yang masih berisi
   * {"devices":[...],"source":...,"updatedAt":...} dan hapus sebelum
   * menulis struktur baru yang flat.
   * Dipanggil sekali saat startup.
   */
  private def migrateLegacyFirebaseNode(): Unit = {
    if (!firebaseEnabled || firebaseRootUrl.trim.isEmpty) return
    val nodePath = firebaseDeviceUrl(deviceId)
    try {
      val getReq = HttpRequest.newBuilder(URI.create(nodePath))
        .header("Accept", "application/json").GET().build()
      val getResp = httpClient.send(getReq, HttpResponse.BodyHandlers.ofString())
      if (getResp.statusCode() < 200 || getResp.statusCode() >= 300) return
      val body = getResp.body().trim
      // Jika node lama mengandung "devices" key (nested), hapus dulu
      if (body.contains("\"devices\"")) {
        println(s"[${java.time.LocalDateTime.now()}] Detected legacy Firebase structure for $deviceId — deleting to migrate...")
        val delReq = HttpRequest.newBuilder(URI.create(nodePath)).DELETE().build()
        val delResp = httpClient.send(delReq, HttpResponse.BodyHandlers.ofString())
        if (delResp.statusCode() >= 200 && delResp.statusCode() < 300) {
          println(s"[${java.time.LocalDateTime.now()}] Legacy node deleted. Will write flat structure on next snapshot.")
        } else {
          println(s"[${java.time.LocalDateTime.now()}] Legacy delete failed: HTTP ${delResp.statusCode()}")
        }
      } else {
        println(s"[${java.time.LocalDateTime.now()}] Firebase node structure OK — no migration needed.")
      }
    } catch {
      case ex: Exception =>
        println(s"[${java.time.LocalDateTime.now()}] Migration check error: ${ex.getMessage}")
    }
  }

  private def writeSnapshot(): Unit = {
    val (snapshotJson, deviceJson) = buildJsonPair()

    // Tulis file lokal (format snapshot penuh untuk web)
    val path = Paths.get(outputPath)
    val parent = path.getParent
    if (parent != null) Files.createDirectories(parent)

    Files.writeString(
      path, snapshotJson, StandardCharsets.UTF_8,
      StandardOpenOption.CREATE,
      StandardOpenOption.TRUNCATE_EXISTING,
      StandardOpenOption.WRITE
    )
    println(s"[${java.time.LocalDateTime.now()}] wrote ${path.toAbsolutePath}")

    publishFirebaseDevice(deviceJson)
    publishSnapshotHistoryIfNeeded()
    cleanupStaleNonRaspberryNodes()
  }

  private def demandVehicleCount(): Int = {
    val local =
      try math.max(0, yoloDetector.snapshot().vehicleCount)
      catch { case _: Exception => 0 }
    math.max(local, remoteVehicleDemandCount())
  }

  private def remoteVehicleDemandCount(): Int = {
    if (!firebaseEnabled || firebaseRootUrl.trim.isEmpty) return 0
    val now = System.currentTimeMillis()
    if (now - cachedRemoteDemandAt < 2500L) return cachedRemoteDemandCount
    cachedRemoteDemandAt = now
    try {
      val path = s"devices/${URLEncoder.encode(deviceId, StandardCharsets.UTF_8)}/objectDetection"
      val request = HttpRequest
        .newBuilder(URI.create(firebasePathUrl(path)))
        .header("Accept", "application/json")
        .timeout(Duration.ofSeconds(3))
        .GET()
        .build()
      val response = httpClient.send(request, HttpResponse.BodyHandlers.ofString())
      if (response.statusCode() < 200 || response.statusCode() >= 300) return cachedRemoteDemandCount
      val body = response.body()
      val updatedAt = jsonLongField(body, "updatedAt").getOrElse(0L)
      val total = jsonLongField(body, "total")
        .orElse(jsonLongField(body, "vehicleCount"))
        .getOrElse(0L)
      cachedRemoteDemandCount =
        if (updatedAt > 0L && now - updatedAt <= 30_000L) math.max(0, math.min(Int.MaxValue.toLong, total).toInt)
        else 0
      cachedRemoteDemandCount
    } catch {
      case _: Exception => cachedRemoteDemandCount
    }
  }

  private def jsonLongField(json: String, key: String): Option[Long] = {
    val pattern = ("\"" + java.util.regex.Pattern.quote(key) + "\"\\s*:\\s*(-?\\d+)").r
    pattern.findFirstMatchIn(json).flatMap { m =>
      try Some(m.group(1).toLong)
      catch { case _: NumberFormatException => None }
    }
  }

  /**
   * Mengembalikan dua string JSON:
   *   1. snapshotJson — format penuh untuk file lokal & web frontend
   *   2. deviceJson   — hanya data device, untuk disimpan di Firebase RTDB
   *
   * FIX: Sebelumnya hanya ada satu JSON (snapshotJson) yang dikirim ke Firebase,
   * sehingga node Firebase berisi {"updatedAt":...,"source":...,"devices":[...]}
   * alih-alih {id, label, status, lastSeen, position, ...}.
   * Frontend membaca Firebase dan mengharapkan struktur device langsung.
   */
  private def buildJsonPair(): (String, String) = {
    val lastSeen    = System.currentTimeMillis()
    val updatedAt   = lastSeen
    val location = currentLocation()
    val detector = yoloDetector.snapshot()
    val signal = trafficSignal.snapshot()
    val lastSeenText = lastSeenFormatter.format(Instant.ofEpochMilli(lastSeen))
    if (cameraEnabled && cameraPublicUrl.trim.nonEmpty && cameraStatus == "online") {
      cameraUpdatedAt = lastSeen
    }
    val updateStatus = updateStatusJson()

    // Device JSON — struktur flat yang sesuai dengan SnapshotDevice di frontend
    val deviceJsonLegacy =
      s"""{
         |  "id": "${escapeJson(deviceId)}",
         |  "label": "${escapeJson(label)}",
         |  "status": "${escapeJson(status)}",
         |  "lastSeen": $lastSeen,
         |  "lastSeenText": "${escapeJson(lastSeenText)}",
         |  "note": "${escapeJson(note)}",
         |  "roadName": "${escapeJson(location.label)}",
         |  "locationSource": "${escapeJson(location.source)}",
         |  "locationLabel": "${escapeJson(location.label)}",
         |  "locationAccuracyM": ${location.accuracyM},
         |  "cameraEnabled": ${cameraEnabled},
         |  "cameraMode": "${escapeJson(cameraMode)}",
         |  "webrtcEnabled": ${cameraEnabled && webrtcEnabled},
         |  "webrtcPath": "${escapeJson(webrtcSignalPath)}",
         |  "webrtcUrl": "${escapeJson(if (cameraEnabled) cameraPublicUrl else "")}",
         |  "cameraReady": ${cameraEnabled && ((cameraMode == "webrtc" && webrtcEnabled) || cameraPublicUrl.nonEmpty)},
         |  "cameraUrl": "${escapeJson(if (cameraEnabled) cameraPublicUrl else "")}",
         |  "cameraStatus": "${escapeJson(cameraStatus)}",
         |  "cameraUpdatedAt": ${cameraUpdatedAt},
         |  "cameraNote": "${escapeJson(cameraError)}",
         |  "detectorStatus": "${escapeJson(detector.status)}",
         |  "detectorNote": "${escapeJson(detector.note)}",
         |  "detectorUpdatedAt": ${detector.updatedAt},
         |  "detectorFps": ${formatDouble(detector.fps)},
         |  "detectorFrameWidth": ${detector.frameWidth},
         |  "detectorFrameHeight": ${detector.frameHeight},
         |  "objectCount": ${detector.vehicleBreakdown.total},
         |  "detectorCameraSource": "${escapeJson(yoloConfig.cameraSource)}",
         |  "detectorConfidence": ${formatDouble(yoloConfig.confidenceThreshold)},
         |  "detectorOutputShape": "${escapeJson(detector.outputShape)}",
         |  "vehicleCount": ${detector.vehicleBreakdown.total},
         |  "vehicleBreakdown": ${vehicleBreakdownJson(detector.vehicleBreakdown)},
         |  "trafficColor": "${escapeJson(signal.color)}",
         |  "trafficStartedAt": ${signal.startedAt},
         |  "trafficDurationSec": ${signal.durationSec},
         |  "trafficSource": "${escapeJson(signal.source)}",
         |  "gpioBackend": "${escapeJson(signal.gpioBackend)}",
         |  "gpioReady": ${signal.gpioReady},
         |  "gpioNote": "${escapeJson(signal.gpioNote)}",
         |  "update": $updateStatus,
         |  "position": {
         |    "lat": ${location.lat},
         |    "lng": ${location.lng}
         |  }
         |}""".stripMargin

    // Snapshot JSON — wrapper untuk file lokal (web frontend membaca ini)
    val deviceJson =
      s"""{
         |  "id": "${escapeJson(deviceId)}",
         |  "label": "${escapeJson(label)}",
         |  "status": "${escapeJson(status)}",
         |  "lastSeen": $lastSeen,
         |  "updatedAt": $updatedAt,
         |  "note": "${escapeJson(note)}",
         |  "location": {
         |    "lat": ${location.lat},
         |    "lng": ${location.lng},
         |    "label": "${escapeJson(location.label)}",
         |    "source": "${escapeJson(location.source)}",
         |    "accuracyM": ${location.accuracyM}
         |  },
         |  "camera": {
         |    "enabled": ${cameraEnabled},
         |    "mode": "${escapeJson(cameraMode)}",
         |    "tunnelUrl": "${escapeJson(if (cameraEnabled) cameraPublicUrl else "")}",
         |    "status": "${escapeJson(cameraStatus)}",
         |    "ready": ${cameraEnabled && cameraPublicUrl.nonEmpty},
         |    "updatedAt": ${cameraUpdatedAt},
         |    "note": "${escapeJson(cameraError)}"
         |  },
         |  "traffic": {
         |    "current": "${escapeJson(signal.color)}",
         |    "red": ${signal.color == "red"},
         |    "yellow": ${signal.color == "yellow"},
         |    "green": ${signal.color == "green"},
         |    "startedAt": ${signal.startedAt},
         |    "durationSec": ${signal.durationSec},
         |    "source": "${escapeJson(signal.source)}",
         |    "gpioBackend": "${escapeJson(signal.gpioBackend)}",
         |    "gpioReady": ${signal.gpioReady},
         |    "gpioNote": "${escapeJson(signal.gpioNote)}"
         |  },
         |  "objectDetection": {
         |    "source": "raspberry-yolo",
         |    "status": "${escapeJson(detector.status)}",
         |    "note": "${escapeJson(detector.note)}",
         |    "updatedAt": ${detector.updatedAt},
         |    "fps": ${formatDouble(detector.fps)},
         |    "frameWidth": ${detector.frameWidth},
         |    "frameHeight": ${detector.frameHeight},
         |    "cameraSource": "${escapeJson(yoloConfig.cameraSource)}",
         |    "confidence": ${formatDouble(yoloConfig.confidenceThreshold)},
         |    "outputShape": "${escapeJson(detector.outputShape)}",
         |    "car": ${detector.vehicleBreakdown.car},
         |    "motorcycle": ${detector.vehicleBreakdown.motorcycle},
         |    "truck": ${detector.vehicleBreakdown.truck},
         |    "bus": ${detector.vehicleBreakdown.bus},
         |    "bicycle": ${detector.vehicleBreakdown.bicycle},
         |    "total": ${detector.vehicleBreakdown.total},
         |    "objectCount": ${detector.vehicleBreakdown.total}
         |  }
         |}""".stripMargin

    val snapshotJson =
      s"""{
         |  "updatedAt": $updatedAt,
         |  "source": "scala-controller",
         |  "devices": [
         |    $deviceJson
         |  ]
         |}""".stripMargin

    (snapshotJson, deviceJson)
  }

  private def updateStatusJson(): String = {
    try {
      val path = Paths.get(updateStatusPath)
      if (!Files.exists(path)) return "{}"
      val body = Files.readString(path, StandardCharsets.UTF_8).trim
      if (body.startsWith("{") && body.endsWith("}")) body else "{}"
    } catch {
      case _: Exception => "{}"
    }
  }

  // ─── Firebase: publish device node ────────────────────────────

  /**
   * FIX: fungsi ini menggantikan publishFirebaseSnapshot.
   * Hanya mengirim deviceJson (bukan snapshotJson) ke path devices/{deviceId}.
   * Dengan demikian struktur RTDB menjadi benar dan frontend bisa parse
   * devices sebagai Record<string, SnapshotDevice>.
   */
  private def publishFirebaseDevice(deviceJson: String): Unit = {
    if (!firebaseEnabled || firebaseRootUrl.trim.isEmpty) return

    val devicePath = firebaseDeviceUrl(deviceId)

    try {
      val request = HttpRequest
        .newBuilder(URI.create(devicePath))
        .header("Content-Type", "application/json")
        .PUT(HttpRequest.BodyPublishers.ofString(deviceJson))
        .build()

      val response = httpClient.send(request, HttpResponse.BodyHandlers.ofString())
      if (response.statusCode() >= 200 && response.statusCode() < 300) {
        val location = currentLocation()
        println(s"[${java.time.LocalDateTime.now()}] published device to Firebase RTDB: $deviceId @ (${location.lat}, ${location.lng}) from ${location.source}")
      } else {
        println(s"[${java.time.LocalDateTime.now()}] Firebase publish failed: HTTP ${response.statusCode()} — ${response.body().take(200)}")
        if (response.statusCode() == 401) {
          firebaseEnabled = false
          println(s"[${java.time.LocalDateTime.now()}] Firebase disabled: unauthorized. Set ITS_FIREBASE_AUTH atau periksa rules database.")
        }
      }
    } catch {
      case ex: Exception =>
        println(s"[${java.time.LocalDateTime.now()}] Firebase publish error: ${ex.getMessage}")
    }
  }

  // ─── Firebase: cleanup stale nodes ────────────────────────────

  private def cleanupStaleNonRaspberryNodes(): Unit = {
    if (!firebaseEnabled || firebaseRootUrl.trim.isEmpty) return

    try {
      val request = HttpRequest
        .newBuilder(URI.create(firebasePathUrl("devices")))
        .header("Accept", "application/json")
        .GET()
        .build()

      val response = httpClient.send(request, HttpResponse.BodyHandlers.ofString())
      if (response.statusCode() < 200 || response.statusCode() >= 300) {
        println(s"[${java.time.LocalDateTime.now()}] Firebase cleanup skipped: HTTP ${response.statusCode()}")
        return
      }

      val staleIds = extractStaleDeviceIds(response.body(), staleDeleteAfterMs)
        .filterNot(_.startsWith("raspberry"))
        .filterNot(_ == deviceId)

      staleIds.foreach(deleteDeviceNode)
    } catch {
      case ex: Exception =>
        println(s"[${java.time.LocalDateTime.now()}] Firebase cleanup error: ${ex.getMessage}")
    }
  }

  private def deleteDeviceNode(id: String): Unit = {
    val deleteUrl = firebaseDeviceUrl(id)
    try {
      val request = HttpRequest
        .newBuilder(URI.create(deleteUrl))
        .DELETE()
        .build()
      val response = httpClient.send(request, HttpResponse.BodyHandlers.ofString())
      if (response.statusCode() >= 200 && response.statusCode() < 300)
        println(s"[${java.time.LocalDateTime.now()}] deleted stale node $id from Firebase RTDB")
      else
        println(s"[${java.time.LocalDateTime.now()}] Firebase delete failed for $id: HTTP ${response.statusCode()}")
    } catch {
      case ex: Exception =>
        println(s"[${java.time.LocalDateTime.now()}] Firebase delete error for $id: ${ex.getMessage}")
    }
  }

  private def extractStaleDeviceIds(json: String, staleAfterMs: Long): Seq[String] = {
    val entryPattern = """(?s)"([^\"]+)"\s*:\s*\{.*?"lastSeen"\s*:\s*(\d+)""".r
    val cutoff = System.currentTimeMillis() - staleAfterMs
    entryPattern.findAllMatchIn(json).flatMap { m =>
      val id       = m.group(1)
      val lastSeen = try m.group(2).toLong catch { case _: Throwable => 0L }
      if (lastSeen > 0 && lastSeen < cutoff) Some(id) else None
    }.toSeq
  }

  // ─── Helpers ──────────────────────────────────────────────────

  /** Mengembalikan "?auth=..." atau "" */
  private def publishSnapshotHistoryIfNeeded(): Unit = {
    if (!firebaseEnabled || firebaseRootUrl.trim.isEmpty || snapshotUrl.trim.isEmpty) return
    val now = System.currentTimeMillis()
    if (now - lastSnapshotPublishedAt < snapshotIntervalMs) return

    fetchSnapshotDataUrl() match {
      case Some(dataUrl) =>
        val nextSlot = if (snapshotSlot == 1) 2 else 1
        val key = s"image$nextSlot"
        val payload =
          s"""{
             |  "$key": "${escapeJson(dataUrl)}",
             |  "${key}UpdatedAt": $now,
             |  "updatedAt": $now,
             |  "active": "$key",
             |  "deviceId": "${escapeJson(deviceId)}",
             |  "source": "raspberry-controller",
             |  "cameraUrl": "${escapeJson(cameraPublicUrl)}"
             |}""".stripMargin
        try {
          val request = HttpRequest
            .newBuilder(URI.create(firebasePathUrl("snapshotHistory")))
            .header("Content-Type", "application/json")
            .method("PATCH", HttpRequest.BodyPublishers.ofString(payload))
            .build()
          val response = httpClient.send(request, HttpResponse.BodyHandlers.ofString())
          if (response.statusCode() >= 200 && response.statusCode() < 300) {
            snapshotSlot = nextSlot
            lastSnapshotPublishedAt = now
            println(s"[${java.time.LocalDateTime.now()}] published snapshotHistory/$key (${dataUrl.length} chars)")
          } else {
            println(s"[${java.time.LocalDateTime.now()}] snapshotHistory publish failed: HTTP ${response.statusCode()} - ${response.body().take(200)}")
          }
        } catch {
          case ex: Exception =>
            println(s"[${java.time.LocalDateTime.now()}] snapshotHistory publish error: ${ex.getMessage}")
        }
      case None => ()
    }
  }

  private def fetchSnapshotDataUrl(): Option[String] = {
    try {
      val request = HttpRequest
        .newBuilder(URI.create(snapshotUrl))
        .timeout(Duration.ofSeconds(6))
        .header("Accept", "image/*")
        .GET()
        .build()
      val response = httpClient.send(request, HttpResponse.BodyHandlers.ofByteArray())
      if (response.statusCode() < 200 || response.statusCode() >= 300) return None
      val bytes = response.body()
      if (bytes == null || bytes.length == 0) return None
      if (bytes.length > snapshotMaxBytes) {
        println(s"[${java.time.LocalDateTime.now()}] snapshot skipped: ${bytes.length} bytes exceeds ITS_SNAPSHOT_MAX_BYTES=$snapshotMaxBytes")
        return None
      }
      val contentType = response.headers().firstValue("Content-Type").orElse("image/jpeg").split(";")(0).trim
      val mediaType = if (contentType.startsWith("image/")) contentType else "image/jpeg"
      Some(s"data:$mediaType;base64,${Base64.getEncoder.encodeToString(bytes)}")
    } catch {
      case ex: Exception =>
        println(s"[${java.time.LocalDateTime.now()}] snapshot fetch failed from $snapshotUrl: ${ex.getMessage}")
        None
    }
  }

  private def firebaseRootFromDevicesUrl(value: String): String =
    value.trim.stripSuffix("/").stripSuffix("/devices")

  private def firebasePathUrl(path: String): String =
    s"${firebaseRootUrl.stripSuffix("/")}/${path.stripPrefix("/")}.json${authSuffixQuery()}"

  private def firebaseDeviceUrl(id: String): String =
    s"${firebaseRootUrl.stripSuffix("/")}/devices/${URLEncoder.encode(id, StandardCharsets.UTF_8)}.json${authSuffixQuery()}"

  private def authSuffix(): String =
    if (firebaseAuth.trim.isEmpty) ""
    else s"?auth=${URLEncoder.encode(firebaseAuth.trim, StandardCharsets.UTF_8)}"

  /** Sama dengan authSuffix tapi untuk URL yang sudah diakhiri .json */
  private def authSuffixQuery(): String = authSuffix()

  private def initCameraState(): Unit = {
    if (!cameraEnabled) {
      cameraStatus = "disabled"
      cameraUpdatedAt = 0L
      cameraError = "camera disabled by ITS_CAMERA_ENABLED=false"
      println(s"[${java.time.LocalDateTime.now()}] ${cameraError}")
      return
    }

    if (cameraPublicUrl.trim.nonEmpty) {
      cameraStatus = "online"
      cameraUpdatedAt = System.currentTimeMillis()
      cameraError = ""
      println(s"[${java.time.LocalDateTime.now()}] Public camera URL active: $cameraPublicUrl")
      return
    }

    if (cameraMode == "webrtc" && webrtcEnabled) {
      cameraStatus = "online"
      cameraUpdatedAt = System.currentTimeMillis()
      cameraError = "Firebase WebRTC signaling active; no private LAN camera URL is published"
      println(s"[${java.time.LocalDateTime.now()}] ${cameraError}")
      return
    }

    cameraStatus = "error"
    cameraUpdatedAt = 0L
    cameraError = "Set ITS_CAMERA_PUBLIC_URL / ITS_CAMERA_WEBRTC_URL, atau aktifkan ITS_CAMERA_MODE=webrtc"
    println(s"[${java.time.LocalDateTime.now()}] ${cameraError}")
  }

  private def publishOfflineDevice(): Unit = {
    if (!firebaseEnabled || firebaseRootUrl.trim.isEmpty) return
    val lastSeen = System.currentTimeMillis()
    val lastSeenText = lastSeenFormatter.format(Instant.ofEpochMilli(lastSeen))
    val location = currentLocation()
    val detector = yoloDetector.snapshot()
    val signal = trafficSignal.snapshot()
    val bodyLegacy =
      s"""{
         |  "id": "${escapeJson(deviceId)}",
         |  "label": "${escapeJson(label)}",
         |  "status": "offline",
         |  "lastSeen": $lastSeen,
         |  "lastSeenText": "${escapeJson(lastSeenText)}",
         |  "note": "${escapeJson(note)}; controller berhenti",
         |  "roadName": "${escapeJson(location.label)}",
         |  "locationSource": "${escapeJson(location.source)}",
         |  "locationLabel": "${escapeJson(location.label)}",
         |  "locationAccuracyM": ${location.accuracyM},
         |  "cameraEnabled": ${cameraEnabled},
         |  "cameraMode": "${escapeJson(cameraMode)}",
         |  "webrtcEnabled": ${cameraEnabled && webrtcEnabled},
         |  "webrtcPath": "${escapeJson(webrtcSignalPath)}",
         |  "webrtcUrl": "${escapeJson(if (cameraEnabled) cameraPublicUrl else "")}",
         |  "cameraReady": false,
         |  "cameraUrl": "${escapeJson(if (cameraEnabled) cameraPublicUrl else "")}",
         |  "detectorStatus": "${escapeJson(detector.status)}",
         |  "detectorNote": "controller offline",
         |  "detectorUpdatedAt": ${detector.updatedAt},
         |  "detectorFps": 0,
         |  "detectorFrameWidth": ${detector.frameWidth},
         |  "detectorFrameHeight": ${detector.frameHeight},
         |  "objectCount": 0,
         |  "detectorCameraSource": "${escapeJson(yoloConfig.cameraSource)}",
         |  "detectorConfidence": ${formatDouble(yoloConfig.confidenceThreshold)},
         |  "detectorOutputShape": "${escapeJson(detector.outputShape)}",
         |  "vehicleCount": ${detector.vehicleBreakdown.total},
         |  "vehicleBreakdown": ${vehicleBreakdownJson(detector.vehicleBreakdown)},
         |  "trafficColor": "${escapeJson(signal.color)}",
         |  "trafficStartedAt": ${signal.startedAt},
         |  "trafficDurationSec": ${signal.durationSec},
         |  "trafficSource": "${escapeJson(signal.source)}",
         |  "gpioBackend": "${escapeJson(signal.gpioBackend)}",
         |  "gpioReady": ${signal.gpioReady},
         |  "gpioNote": "${escapeJson(signal.gpioNote)}",
         |  "position": {
         |    "lat": ${location.lat},
         |    "lng": ${location.lng}
         |  }
         |}""".stripMargin
    val body =
      s"""{
         |  "id": "${escapeJson(deviceId)}",
         |  "label": "${escapeJson(label)}",
         |  "status": "offline",
         |  "lastSeen": $lastSeen,
         |  "updatedAt": $lastSeen,
         |  "note": "${escapeJson(note)}; controller berhenti",
         |  "location": {
         |    "lat": ${location.lat},
         |    "lng": ${location.lng},
         |    "label": "${escapeJson(location.label)}",
         |    "source": "${escapeJson(location.source)}",
         |    "accuracyM": ${location.accuracyM}
         |  },
         |  "camera": {
         |    "enabled": ${cameraEnabled},
         |    "mode": "${escapeJson(cameraMode)}",
         |    "tunnelUrl": "${escapeJson(if (cameraEnabled) cameraPublicUrl else "")}",
         |    "status": "offline",
         |    "ready": false,
         |    "updatedAt": $lastSeen,
         |    "note": "controller offline"
         |  },
         |  "traffic": {
         |    "current": "${escapeJson(signal.color)}",
         |    "red": ${signal.color == "red"},
         |    "yellow": ${signal.color == "yellow"},
         |    "green": ${signal.color == "green"},
         |    "startedAt": ${signal.startedAt},
         |    "durationSec": ${signal.durationSec},
         |    "source": "${escapeJson(signal.source)}",
         |    "gpioBackend": "${escapeJson(signal.gpioBackend)}",
         |    "gpioReady": ${signal.gpioReady},
         |    "gpioNote": "${escapeJson(signal.gpioNote)}"
         |  },
         |  "objectDetection": {
         |    "source": "raspberry-yolo",
         |    "status": "${escapeJson(detector.status)}",
         |    "note": "controller offline",
         |    "updatedAt": ${detector.updatedAt},
         |    "fps": 0,
         |    "frameWidth": ${detector.frameWidth},
         |    "frameHeight": ${detector.frameHeight},
         |    "cameraSource": "${escapeJson(yoloConfig.cameraSource)}",
         |    "confidence": ${formatDouble(yoloConfig.confidenceThreshold)},
         |    "outputShape": "${escapeJson(detector.outputShape)}",
         |    "car": ${detector.vehicleBreakdown.car},
         |    "motorcycle": ${detector.vehicleBreakdown.motorcycle},
         |    "truck": ${detector.vehicleBreakdown.truck},
         |    "bus": ${detector.vehicleBreakdown.bus},
         |    "bicycle": ${detector.vehicleBreakdown.bicycle},
         |    "total": ${detector.vehicleBreakdown.total},
         |    "objectCount": 0
         |  }
         |}""".stripMargin
    try publishFirebaseDevice(body)
    catch { case _: Throwable => () }
  }

  private def currentLocation(): GeoLocation = {
    val baseLocation = manualLocation()
      .orElse(gpsLocation())
      .orElse(firebaseLocation())
      .orElse(gpsFallbackLocation())
      .orElse(ipGeolocation())
      .getOrElse(GeoLocation(
        fallbackLatitude,
        fallbackLongitude,
        "fallback",
        "fallback coordinate",
        50_000
      ))

    snapToRoad(baseLocation).getOrElse(baseLocation)
  }

  private def manualLocation(): Option[GeoLocation] = {
    if (locationMode != "manual") return None
    for {
      lat <- explicitLatitude
      lng <- explicitLongitude
      if lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
    } yield GeoLocation(lat, lng, "env", "ITS_LATITUDE/ITS_LONGITUDE", 0)
  }

  private def gpsLocation(): Option[GeoLocation] = {
    if (!gpsEnabled) return None
    val now = System.currentTimeMillis()
    cachedGpsLocation match {
      case Some((updatedAt, location)) if now - updatedAt < gpsCacheMs =>
        return Some(location)
      case _ => ()
    }
    if (now - lastGpsAttemptAt < gpsCacheMs) return cachedGpsLocation.map(_._2)
    lastGpsAttemptAt = now

    val fresh = gpsdLocation().orElse(gpsDevices.view.flatMap(readGpsDevice).headOption)
    fresh.foreach(location => cachedGpsLocation = Some(now -> location))
    fresh
  }

  private def gpsFallbackLocation(): Option[GeoLocation] = {
    if (!gpsEnabled) return None
    for {
      lat <- gpsFallbackLatitude
      lng <- gpsFallbackLongitude
      if lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
    } yield GeoLocation(lat, lng, "gps-fallback", gpsCoordinateLabel(lat, lng, "GPS menunggu fix"), 100)
  }

  private def gpsdLocation(): Option[GeoLocation] = {
    if (!gpsdEnabled) return None
    try {
      val readSeconds = math.max(2, gpsReadSeconds + 1)
      val process = new ProcessBuilder("timeout", s"${readSeconds}s", "gpspipe", "-w", "-n", "12")
        .redirectErrorStream(true)
        .start()
      val body = new String(process.getInputStream.readAllBytes(), StandardCharsets.UTF_8)
      process.waitFor((readSeconds + 1).toLong, TimeUnit.SECONDS)
      if (process.isAlive) process.destroyForcibly()
      body.split("\\r?\\n").toSeq.map(_.trim).filter(_.nonEmpty).view.flatMap(parseGpsdLocation).headOption
    } catch {
      case _: Exception => None
    }
  }

  private def parseGpsdLocation(json: String): Option[GeoLocation] = {
    if (!json.contains("\"TPV\"")) return None
    val mode = extractNumber(json, "mode").map(_.toInt).getOrElse(0)
    if (mode < 2) return None
    for {
      lat <- extractNumber(json, "lat")
      lng <- extractNumber(json, "lon").orElse(extractNumber(json, "lng"))
      if lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
    } yield GeoLocation(
      lat,
      lng,
      "gps",
      gpsCoordinateLabel(lat, lng, s"GPSD mode $mode"),
      if (mode >= 3) 6 else 15
    )
  }

  private def readGpsDevice(device: String): Option[GeoLocation] = {
    val path = Paths.get(device)
    if (!Files.exists(path)) return None
    configureGpsDevice(device)
    val lines = readGpsLines(device)
    val parsed = lines.view.flatMap(line => parseNmeaLocation(line, device)).headOption
    if (parsed.isEmpty && lines.exists(_.startsWith("$"))) {
      println(s"[${java.time.LocalDateTime.now()}] GPS $device aktif tetapi belum fix satelit")
    }
    parsed
  }

  private def configureGpsDevice(device: String): Unit = {
    try {
      val process = new ProcessBuilder("stty", "-F", device, gpsBaud.toString, "raw", "-echo")
        .redirectErrorStream(true)
        .start()
      process.waitFor(1, TimeUnit.SECONDS)
      if (process.isAlive) process.destroyForcibly()
    } catch {
      case _: Exception => ()
    }
  }

  private def readGpsLines(device: String): Seq[String] = {
    try {
      val process = new ProcessBuilder("timeout", s"${gpsReadSeconds}s", "cat", device)
        .redirectErrorStream(true)
        .start()
      val body = new String(process.getInputStream.readAllBytes(), StandardCharsets.UTF_8)
      process.waitFor((gpsReadSeconds + 2).toLong, TimeUnit.SECONDS)
      if (process.isAlive) process.destroyForcibly()
      body.split("\\r?\\n").toSeq.map(_.trim).filter(_.nonEmpty).take(120)
    } catch {
      case ex: Exception =>
        println(s"[${java.time.LocalDateTime.now()}] GPS read failed from $device: ${ex.getMessage}")
        Seq.empty
    }
  }

  private def parseNmeaLocation(line: String, device: String): Option[GeoLocation] = {
    val clean = line.trim
    if (!clean.startsWith("$")) return None
    val fields = clean.takeWhile(_ != '*').stripPrefix("$").split(",", -1)
    val sentence = fields.headOption.getOrElse("")
    if (sentence.endsWith("RMC") && fields.length > 6 && fields(2) == "A") {
      for {
        lat <- parseNmeaCoordinate(fields(3), fields(4))
        lng <- parseNmeaCoordinate(fields(5), fields(6))
        if lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
      } yield GeoLocation(lat, lng, "gps", gpsCoordinateLabel(lat, lng, s"RMC $device"), 10)
    } else if (sentence.endsWith("GGA") && fields.length > 7 && parseInt(fields(6)).exists(_ > 0)) {
      val satellites = parseInt(fields(7)).getOrElse(0)
      for {
        lat <- parseNmeaCoordinate(fields(2), fields(3))
        lng <- parseNmeaCoordinate(fields(4), fields(5))
        if lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
      } yield GeoLocation(lat, lng, "gps", gpsCoordinateLabel(lat, lng, s"GPS $satellites satelit"), if (satellites >= 4) 8 else 25)
    } else if (sentence.endsWith("GLL") && fields.length > 6 && fields(6) == "A") {
      for {
        lat <- parseNmeaCoordinate(fields(1), fields(2))
        lng <- parseNmeaCoordinate(fields(3), fields(4))
        if lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
      } yield GeoLocation(lat, lng, "gps", gpsCoordinateLabel(lat, lng, s"GLL $device"), 15)
    } else {
      None
    }
  }

  private def gpsCoordinateLabel(lat: Double, lng: Double, note: String): String = {
    val coordinate = f"$lat%.6f, $lng%.6f"
    if (note.trim.isEmpty) coordinate else s"$coordinate ($note)"
  }

  private def parseNmeaCoordinate(value: String, hemisphere: String): Option[Double] = {
    val hemi = hemisphere.trim.toUpperCase(Locale.ROOT)
    if (value.trim.isEmpty || hemi.isEmpty) return None
    val degDigits = if (hemi == "N" || hemi == "S") 2 else 3
    if (value.length <= degDigits) return None
    for {
      degrees <- parseDouble(value.take(degDigits))
      minutes <- parseDouble(value.drop(degDigits))
    } yield {
      val sign = if (hemi == "S" || hemi == "W") -1.0 else 1.0
      sign * (degrees + minutes / 60.0)
    }
  }

  private def ipGeolocation(): Option[GeoLocation] = {
    val now = System.currentTimeMillis()
    cachedLocation match {
      case Some((updatedAt, location)) if now - updatedAt < geoRefreshMs =>
        return Some(location)
      case _ => ()
    }

    val fresh = ipGeolocationUrls.view.flatMap(fetchIpGeolocation).headOption
    fresh.foreach(location => cachedLocation = Some(now -> location))
    fresh
  }

  private def fetchIpGeolocation(url: String): Option[GeoLocation] = {
    try {
      val request = HttpRequest
        .newBuilder(URI.create(url))
        .header("Accept", "application/json")
        .header("User-Agent", "its-maps-controller/1.0")
        .GET()
        .build()
      val response = httpClient.send(request, HttpResponse.BodyHandlers.ofString())
      if (response.statusCode() < 200 || response.statusCode() >= 300) return None
      parseIpGeolocation(response.body(), url)
    } catch {
      case ex: Exception =>
        println(s"[${java.time.LocalDateTime.now()}] IP geolocation failed from $url: ${ex.getMessage}")
        None
    }
  }

  private def parseIpGeolocation(json: String, url: String): Option[GeoLocation] = {
    val lat =
      extractNumber(json, "latitude")
        .orElse(extractNumber(json, "lat"))
    val lng =
      extractNumber(json, "longitude")
        .orElse(extractNumber(json, "lon"))
        .orElse(extractNumber(json, "lng"))

    for {
      latitude <- lat
      longitude <- lng
      if latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180
    } yield {
      val city = extractString(json, "city").getOrElse("")
      val region = extractString(json, "region")
        .orElse(extractString(json, "regionName"))
        .getOrElse("")
      val country = extractString(json, "country_name")
        .orElse(extractString(json, "country"))
        .getOrElse("")
      val ip = extractString(json, "ip")
        .orElse(extractString(json, "query"))
        .getOrElse("")
      val label = Seq(city, region, country).filter(_.nonEmpty).mkString(", ")
      val accuracy = extractNumber(json, "accuracy_radius").map(_.toInt).getOrElse(50_000)
      GeoLocation(
        latitude,
        longitude,
        "ip-geolocation",
        if (label.nonEmpty) s"$label${if (ip.nonEmpty) s" / $ip" else ""}" else url,
        accuracy
      )
    }
  }

  private def firebaseLocation(): Option[GeoLocation] = {
    if (!firebaseEnabled || firebaseRootUrl.trim.isEmpty) return None
    val nodePath = firebaseDeviceUrl(deviceId)
    try {
      val request = HttpRequest
        .newBuilder(URI.create(nodePath))
        .header("Accept", "application/json")
        .GET()
        .build()
      val response = httpClient.send(request, HttpResponse.BodyHandlers.ofString())
      if (response.statusCode() < 200 || response.statusCode() >= 300) return None
      extractPosition(response.body())
    } catch {
      case _: Exception => None
    }
  }

  private def extractPosition(json: String): Option[GeoLocation] = {
    for {
      lat <- extractNumber(json, "lat")
      lng <- extractNumber(json, "lng")
      if lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
    } yield GeoLocation(lat, lng, "firebase-cache", "last Firebase position", 50_000)
  }

  private def snapToRoad(location: GeoLocation): Option[GeoLocation] = {
    if (location.lat == 0.0 && location.lng == 0.0) return Some(location)
    if (location.source.startsWith("gps") || location.source == "env") return Some(location)

    val nearestUrl = s"https://router.project-osrm.org/nearest/v1/driving/${location.lng},${location.lat}?number=1"
    try {
      val request = HttpRequest
        .newBuilder(URI.create(nearestUrl))
        .header("Accept", "application/json")
        .header("User-Agent", "its-maps-controller/1.0")
        .GET()
        .build()
      val response = httpClient.send(request, HttpResponse.BodyHandlers.ofString())
      if (response.statusCode() < 200 || response.statusCode() >= 300) return Some(location)

      val body = response.body()
      extractOsrmWaypoint(body)
        .map { case (snappedLng, snappedLat, osrmName) =>
          val roadName = reverseRoadName(snappedLat, snappedLng)
            .orElse(Some(osrmName).filter(_.nonEmpty))
            .orElse(Some(location.label))
            .getOrElse(location.label)
          GeoLocation(
            snappedLat,
            snappedLng,
            "road-snapped",
            roadName,
            math.min(location.accuracyM, 50)
          )
        }
        .orElse(Some(location))
    } catch {
      case _: Exception => Some(location)
    }
  }

  private def extractOsrmWaypoint(json: String): Option[(Double, Double, String)] = {
    val locationPattern = """(?s)"location"\s*:\s*\[\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\]""".r
    val namePattern = """(?s)"name"\s*:\s*"([^"]*)""".r
    for {
      locationMatch <- locationPattern.findFirstMatchIn(json)
    } yield {
      val lng = locationMatch.group(1).toDouble
      val lat = locationMatch.group(2).toDouble
      val name = namePattern.findFirstMatchIn(json).map(m => unescapeJsonString(m.group(1))).getOrElse("")
      (lng, lat, name)
    }
  }

  private def reverseRoadName(lat: Double, lng: Double): Option[String] = {
    val reverseUrl = s"https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=$lat&lon=$lng&zoom=18&addressdetails=1"
    try {
      val request = HttpRequest
        .newBuilder(URI.create(reverseUrl))
        .header("Accept", "application/json")
        .header("User-Agent", "its-maps-controller/1.0")
        .GET()
        .build()
      val response = httpClient.send(request, HttpResponse.BodyHandlers.ofString())
      if (response.statusCode() < 200 || response.statusCode() >= 300) return None

      val body = response.body()
      extractString(body, "road")
        .orElse(extractString(body, "pedestrian"))
        .orElse(extractString(body, "service"))
        .orElse(extractString(body, "residential"))
        .orElse(extractString(body, "footway"))
        .orElse(extractString(body, "path"))
        .orElse(extractString(body, "display_name").flatMap(_.split(",").headOption.map(_.trim)))
    } catch {
      case _: Exception => None
    }
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

  private def envDoubleOpt(name: String): Option[Double] = {
    val value = System.getenv(name)
    if (value == null || value.trim.isEmpty) None else parseDouble(value.trim)
  }

  private def extractNumber(json: String, key: String): Option[Double] = {
    val pattern = (""""""" + java.util.regex.Pattern.quote(key) + """"\s*:\s*(-?\d+(?:\.\d+)?)""").r
    pattern.findFirstMatchIn(json).flatMap(m => parseDouble(m.group(1)))
  }

  private def extractString(json: String, key: String): Option[String] = {
    val pattern = (""""""" + java.util.regex.Pattern.quote(key) + """"\s*:\s*"([^"]*)"""").r
    pattern.findFirstMatchIn(json).map(m => unescapeJsonString(m.group(1))).filter(_.nonEmpty)
  }

  private def parseDouble(value: String): Option[Double] =
    try Some(value.toDouble)
    catch { case _: NumberFormatException => None }

  private def parseInt(value: String): Option[Int] =
    try Some(value.trim.toInt)
    catch { case _: NumberFormatException => None }

  private def unescapeJsonString(value: String): String =
    value
      .replace("\\\"", "\"")
      .replace("\\/", "/")
      .replace("\\n", "\n")
      .replace("\\r", "\r")
      .replace("\\t", "\t")

  private def escapeJson(value: String): String =
    value
      .replace("\\", "\\\\")
      .replace("\"", "\\\"")
      .replace("\n", "\\n")
      .replace("\r", "\\r")
      .replace("\t", "\\t")

  private def vehicleBreakdownJson(value: VehicleBreakdown): String =
    s"""{"car":${value.car},"motorcycle":${value.motorcycle},"bus":${value.bus},"truck":${value.truck},"bicycle":${value.bicycle},"total":${value.total}}"""

  private def detectionsJson(values: Seq[YoloDetection]): String =
    values.map { detection =>
      val isVehicle = yoloConfig.vehicleClassNames.contains(detection.label.toLowerCase(Locale.ROOT))
      s"""{"label":"${escapeJson(detection.label)}","confidence":${formatDouble(detection.confidence)},"vehicle":${isVehicle},"x":${formatDouble(detection.x)},"y":${formatDouble(detection.y)},"width":${formatDouble(detection.width)},"height":${formatDouble(detection.height)}}"""
    }.mkString("[", ",", "]")

  private def formatDouble(value: Double): String =
    if (value.isNaN || value.isInfinity) "0"
    else java.lang.String.format(Locale.US, "%.4f", Double.box(value))

  private def resolveCameraPublicUrl(): String =
    Seq("ITS_CAMERA_PUBLIC_URL", "ITS_CAMERA_WEBRTC_URL", "ITS_CAMERA_URL")
      .map(name => env(name, ""))
      .find(_.nonEmpty)
      .getOrElse("")

  private def resolveYoloCameraFallback(): String =
    Seq(
      env("ITS_YOLO_CAMERA_SOURCE", ""),
      env("ITS_CAMERA_SOURCE", ""),
      env("ITS_CAMERA_DEVICE", "")
    ).find(_.nonEmpty).getOrElse("/dev/video0")
}
