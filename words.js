// 印尼語單字資料庫
// 每次你在 New Text Document.txt 新增/修改單字後，
// 只要跟 Claude 說「更新單字」，就會幫你把新單字的翻譯跟測驗例句補進這裡。

// 預設單字順序（對應 New Text Document.txt 目前內容）
const DEFAULT_WORDS = [
  { id: 1,  text: "Bisa pakai kartu?" },
  { id: 2,  text: "di dekat hotel" },
  { id: 3,  text: "mandi" },
  { id: 4,  text: "olahraga" },
  { id: 5,  text: "memesan" },
  { id: 6,  text: "bawa" },
  { id: 7,  text: "keluar" },
  { id: 8,  text: "tanya" },
  { id: 9,  text: "cari" },
  { id: 10, text: "Tidak masalah." },
  { id: 11, text: "mendorong" },
  { id: 12, text: "tutup" },
  { id: 13, text: "duduk" },
  { id: 14, text: "tersenyum" },
  { id: 15, text: "kenal" },
  { id: 16, text: "ingat" },
];

// 單字資料庫：key 是印尼文原文（跟 txt 檔要一致）
// zh / en：中文、英文意思（Flash card 用）
// quizEn：測驗時顯示的英文句子
// correct：對應的印尼文正確句子
// distractors：3 個錯誤的印尼文選項
const WORD_DB = {
  "Bisa pakai kartu?": {
    zh: "可以用卡嗎？",
    en: "Can I use a card?",
    quizEn: "Can I pay with a card?",
    correct: "Bisa pakai kartu?",
    distractors: [
      "Bisa pakai uang tunai?",
      "Bisa pinjam kartu Anda?",
      "Di mana saya bisa membeli kartu?",
    ],
  },
  "di dekat hotel": {
    zh: "在飯店附近",
    en: "near the hotel",
    quizEn: "There is a restaurant near the hotel.",
    correct: "Ada restoran di dekat hotel.",
    distractors: [
      "Ada restoran di dalam hotel.",
      "Ada restoran jauh dari hotel.",
      "Ada restoran di belakang hotel.",
    ],
  },
  "mandi": {
    zh: "洗澡",
    en: "to bathe / shower",
    quizEn: "I want to take a shower now.",
    correct: "Saya mau mandi sekarang.",
    distractors: [
      "Saya mau makan sekarang.",
      "Saya mau tidur sekarang.",
      "Saya mau berjalan sekarang.",
    ],
  },
  "olahraga": {
    zh: "運動",
    en: "to exercise / sports",
    quizEn: "I exercise every morning.",
    correct: "Saya olahraga setiap pagi.",
    distractors: [
      "Saya makan setiap pagi.",
      "Saya bekerja setiap pagi.",
      "Saya membaca setiap pagi.",
    ],
  },
  "memesan": {
    zh: "訂購 / 預訂",
    en: "to order / to book",
    quizEn: "I want to order food.",
    correct: "Saya mau memesan makanan.",
    distractors: [
      "Saya mau membayar makanan.",
      "Saya mau memasak makanan.",
      "Saya mau membawa makanan.",
    ],
  },
  "bawa": {
    zh: "帶 / 攜帶",
    en: "to bring / to carry",
    quizEn: "Please bring your passport.",
    correct: "Tolong bawa paspor Anda.",
    distractors: [
      "Tolong simpan paspor Anda.",
      "Tolong cari paspor Anda.",
      "Tolong perlihatkan paspor Anda.",
    ],
  },
  "keluar": {
    zh: "出去 / 出來",
    en: "to go out / exit",
    quizEn: "I want to go out for a moment.",
    correct: "Saya mau keluar sebentar.",
    distractors: [
      "Saya mau masuk sebentar.",
      "Saya mau duduk sebentar.",
      "Saya mau istirahat sebentar.",
    ],
  },
  "tanya": {
    zh: "問",
    en: "to ask",
    quizEn: "May I ask a question?",
    correct: "Boleh saya tanya?",
    distractors: [
      "Boleh saya duduk?",
      "Boleh saya masuk?",
      "Boleh saya bayar?",
    ],
  },
  "cari": {
    zh: "找 / 尋找",
    en: "to look for / search",
    quizEn: "I am looking for the toilet.",
    correct: "Saya sedang cari toilet.",
    distractors: [
      "Saya sedang bersihkan toilet.",
      "Saya sedang tutup toilet.",
      "Saya sedang pakai toilet.",
    ],
  },
  "Tidak masalah.": {
    zh: "沒問題。",
    en: "No problem.",
    quizEn: "No problem.",
    correct: "Tidak masalah.",
    distractors: [
      "Ada masalah.",
      "Ini masalah besar.",
      "Saya tidak tahu.",
    ],
  },
  "mendorong": {
    zh: "推",
    en: "to push",
    quizEn: "Please push the door.",
    correct: "Tolong dorong pintunya.",
    distractors: [
      "Tolong tarik pintunya.",
      "Tolong buka pintunya.",
      "Tolong tutup pintunya.",
    ],
  },
  "tutup": {
    zh: "關閉 / 打烊",
    en: "closed / to close",
    quizEn: "The store is closed today.",
    correct: "Tokonya tutup hari ini.",
    distractors: [
      "Tokonya buka hari ini.",
      "Tokonya besar hari ini.",
      "Tokonya ramai hari ini.",
    ],
  },
  "duduk": {
    zh: "坐",
    en: "to sit",
    quizEn: "Please sit here.",
    correct: "Silakan duduk di sini.",
    distractors: [
      "Silakan berdiri di sini.",
      "Silakan tidur di sini.",
      "Silakan makan di sini.",
    ],
  },
  "tersenyum": {
    zh: "微笑",
    en: "to smile",
    quizEn: "She smiled at me.",
    correct: "Dia tersenyum kepada saya.",
    distractors: [
      "Dia marah kepada saya.",
      "Dia berteriak kepada saya.",
      "Dia berbicara kepada saya.",
    ],
  },
  "kenal": {
    zh: "認識",
    en: "to know (someone)",
    quizEn: "I know him well.",
    correct: "Saya kenal dia dengan baik.",
    distractors: [
      "Saya lihat dia dengan baik.",
      "Saya bantu dia dengan baik.",
      "Saya ajak dia dengan baik.",
    ],
  },
  "ingat": {
    zh: "記得",
    en: "to remember",
    quizEn: "I remember your name.",
    correct: "Saya ingat nama Anda.",
    distractors: [
      "Saya lupa nama Anda.",
      "Saya tulis nama Anda.",
      "Saya dengar nama Anda.",
    ],
  },
};
