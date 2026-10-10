#!/usr/bin/env python3
"""把 Châu 老師的上課講義（Google 文件匯出的 .md）裡「新增的內容」整理成
Flashcard 的收件匣檔案，讓 Flashcard 用「📥 匯入講義收件匣」一次匯入。

- 日期區（## 9 Oct 2026）→ 分組用日期：20261009
- # Common Expressions → 分組 common expression
- 其他分類區（Pronouns、Time、Conversation…）→ 不給分組（時間、連接詞那些
  Flashcard 有自己的篩選按鈕）
- # Pronunciation & Alphabet 整區、圖片、純英文的指示（Make 5 sentences…）略過

state.json 記住每一區已經送過哪些行；之後每次執行只會產生「新增的行」。
第一次執行（沒有 state）會把整份講義都送出——已經在 Flashcard 裡的字匯入時
會自動跳過，只補分組。

講義內容只存在本機（class_inbox/ 有 .gitignore），不會推到公開的 GitHub。

用法：python3 tools/vi_class_inbox.py
"""
import hashlib
import json
import re
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HANDOUT = ROOT / "Matt & Châu_Italki VN Class (1).md"
OUT_DIR = ROOT / "class_inbox"
STATE = OUT_DIR / "state.json"
INBOX = OUT_DIR / "講義收件匣.json"

SKIP_SECTIONS = {"pronunciation & alphabet"}
GROUP_FOR_SECTION = {"common expressions": "common expression"}
MONTHS = {m: i for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}
VIET_LETTERS = re.compile(
    "[àáảãạăắằẳẵặâấầẩẫậđèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵ]", re.I)


def unescape_md(line):
    line = re.sub(r"\\(.)", r"\1", line)          # \- \[ \! … → - [ !
    line = line.replace("**", "").replace("__", "")
    return line.strip()


def date_group(heading):
    """'9 Oct 2026' → '20261009'；'3, 4, 7  Sep 2026' → 第一天 '20260903'。"""
    m = re.match(r"^([\d,\s]+?)\s+([A-Za-z]{3})[a-z]*\s+(\d{4})$", heading.strip())
    if not m:
        return None
    month = MONTHS.get(m.group(2).lower())
    day = int(re.findall(r"\d+", m.group(1))[0])
    return f"{m.group(3)}{month:02d}{day:02d}" if month else None


def is_english_only(line):
    """沒有越南文字母、而且有 3 個字以上 → 當成英文說明／指示，略過。"""
    return not VIET_LETTERS.search(line) and len(line.split()) >= 3


def parse_sections(text):
    sections = []  # [{key, label, group, lines}]
    cur = None
    for raw in text.splitlines():
        if re.match(r"^\[image\d+\]:", raw):      # 檔尾的圖片資料
            continue
        h1 = re.match(r"^#\s+(.+?)\s*$", raw)
        h2 = re.match(r"^##\s+(.+?)\s*$", raw)
        if h1 and not raw.startswith("##"):
            name = unescape_md(h1.group(1))
            key = name.lower()
            cur = None if key in SKIP_SECTIONS else {
                "key": key, "label": name, "group": GROUP_FOR_SECTION.get(key, ""), "lines": []}
            if cur:
                sections.append(cur)
            continue
        if h2:
            name = unescape_md(h2.group(1))
            g = date_group(name)
            cur = {"key": g or name.lower(), "label": name, "group": g or "", "lines": []}
            sections.append(cur)
            continue
        if cur is None:
            continue
        line = unescape_md(re.sub(r"^#{3,}\s*", "", raw))
        line = re.sub(r"!\[[^\]]*\]\[[^\]]*\]|!\[[^\]]*\]\([^)]*\)", "", line).strip()
        if not line or is_english_only(line):
            continue
        cur["lines"].append(line)
    return sections


def line_hash(line):
    return hashlib.sha1(re.sub(r"\s+", " ", line).strip().lower().encode()).hexdigest()[:16]


def main():
    if not HANDOUT.exists():
        sys.exit(f"找不到講義：{HANDOUT}")
    OUT_DIR.mkdir(exist_ok=True)
    state = json.loads(STATE.read_text()) if STATE.exists() else {}
    inbox = json.loads(INBOX.read_text()) if INBOX.exists() else []
    first_run = not state
    stamp = datetime.now().strftime("%Y%m%d%H%M%S")
    new_batches = []
    for sec in parse_sections(HANDOUT.read_text(encoding="utf-8")):
        seen = set(state.get(sec["key"], []))
        new_lines = [l for l in sec["lines"] if line_hash(l) not in seen]
        if not new_lines:
            continue
        state[sec["key"]] = sorted(seen | {line_hash(l) for l in new_lines})
        new_batches.append({
            "id": f"class-{sec['key']}-{stamp}",
            "lang": "vi",
            "group": sec["group"],
            "title": f"Châu 講義 {sec['label']}",
            "rawText": "\n".join(new_lines),
            "count": len(new_lines),
        })
    if not new_batches:
        print("講義沒有新增的內容。")
        return
    inbox.extend(new_batches)
    INBOX.write_text(json.dumps(inbox, ensure_ascii=False, indent=1), encoding="utf-8")
    STATE.write_text(json.dumps(state, ensure_ascii=False, indent=1), encoding="utf-8")
    print(("第一次執行，整份講義都送出" if first_run else "新增的內容") + f"：{len(new_batches)} 批")
    for b in new_batches:
        print(f"  {b['title']:<40} 分組「{b['group'] or '（不分組）'}」 {b['count']} 行")
    print(f"→ {INBOX}")


if __name__ == "__main__":
    main()
