package id.ac.telkomuniversity.its;

import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

final class IndonesianObjectLabels {
    private static final Map<String, String> LABELS = new HashMap<>();

    static {
        put("object", "Benda", "objek", "item", "unknown object", "detected object", "barang");
        put("person", "Orang", "human", "pedestrian", "orang", "manusia");
        put("bicycle", "Sepeda", "bike", "cycle", "sepeda");
        put("car", "Mobil", "auto", "automobile", "vehicle", "mobil");
        put("motorcycle", "Motor", "motorbike", "motor", "sepeda motor");
        put("airplane", "Pesawat");
        put("bus", "Bus", "bis");
        put("train", "Kereta");
        put("truck", "Truk", "truk");
        put("boat", "Perahu");
        put("traffic light", "Lampu Lalu Lintas", "lampu lalu lintas");
        put("fire hydrant", "Hidran");
        put("stop sign", "Rambu Stop");
        put("parking meter", "Meter Parkir");
        put("bench", "Bangku");
        put("bird", "Burung");
        put("cat", "Kucing");
        put("dog", "Anjing");
        put("horse", "Kuda");
        put("sheep", "Domba");
        put("cow", "Sapi");
        put("elephant", "Gajah");
        put("bear", "Beruang");
        put("zebra", "Zebra");
        put("giraffe", "Jerapah");
        put("backpack", "Ransel");
        put("umbrella", "Payung");
        put("handbag", "Tas");
        put("tie", "Dasi");
        put("suitcase", "Koper");
        put("frisbee", "Frisbee");
        put("skis", "Ski");
        put("snowboard", "Snowboard");
        put("sports ball", "Bola");
        put("kite", "Layang-layang");
        put("baseball bat", "Tongkat Baseball");
        put("baseball glove", "Sarung Tangan Baseball");
        put("skateboard", "Skateboard");
        put("surfboard", "Papan Selancar");
        put("tennis racket", "Raket Tenis");
        put("bottle", "Botol");
        put("wine glass", "Gelas");
        put("cup", "Cangkir");
        put("fork", "Garpu");
        put("knife", "Pisau");
        put("spoon", "Sendok");
        put("bowl", "Mangkuk");
        put("banana", "Pisang");
        put("apple", "Apel");
        put("sandwich", "Roti Lapis");
        put("orange", "Jeruk");
        put("broccoli", "Brokoli");
        put("carrot", "Wortel");
        put("hot dog", "Hot Dog");
        put("pizza", "Pizza");
        put("donut", "Donat");
        put("cake", "Kue");
        put("chair", "Kursi");
        put("couch", "Sofa");
        put("potted plant", "Tanaman", "plant", "tanaman", "tumbuhan");
        put("bed", "Tempat Tidur");
        put("dining table", "Meja Makan");
        put("toilet", "Toilet");
        put("tv", "TV", "television");
        put("laptop", "Laptop");
        put("mouse", "Mouse");
        put("remote", "Remote");
        put("keyboard", "Keyboard");
        put("cell phone", "Ponsel", "phone", "smartphone", "ponsel");
        put("toy vehicle", "Miniatur Kendaraan", "toy car", "mainan kendaraan", "miniatur kendaraan");
        put("floor", "Lantai", "lantai");
        put("microwave", "Microwave");
        put("oven", "Oven");
        put("toaster", "Pemanggang");
        put("sink", "Wastafel", "wastafel");
        put("refrigerator", "Kulkas");
        put("book", "Buku");
        put("clock", "Jam");
        put("vase", "Vas");
        put("scissors", "Gunting");
        put("teddy bear", "Boneka");
        put("hair drier", "Pengering Rambut", "hair dryer");
        put("toothbrush", "Sikat Gigi");
        put("tree", "Pohon", "pohon");
        put("grass", "Rumput", "rumput");
        put("barrier", "Pembatas Jalan", "pembatas");
        put("parking gate", "Palang Parkir", "palang parkir");
        put("road", "Jalan", "jalan");
        put("sidewalk", "Trotoar", "trotoar");
    }

    private IndonesianObjectLabels() {}

    static String display(String rawLabel) {
        String value = normalize(rawLabel);
        if (value.isEmpty()) return "Objek";
        String translated = LABELS.get(value);
        if (translated != null) return translated;
        StringBuilder title = new StringBuilder();
        for (String part : value.split(" ")) {
            if (part.isEmpty()) continue;
            if (title.length() > 0) title.append(' ');
            title.append(Character.toUpperCase(part.charAt(0))).append(part.substring(1));
        }
        return title.length() == 0 ? "Objek" : title.toString();
    }

    private static void put(String canonical, String display, String... aliases) {
        LABELS.put(normalize(canonical), display);
        for (String alias : aliases) LABELS.put(normalize(alias), display);
    }

    private static String normalize(String value) {
        if (value == null) return "";
        return value.trim().toLowerCase(Locale.ROOT)
            .replace('_', ' ')
            .replace('-', ' ')
            .replaceAll("\\s+", " ");
    }
}
