"""Build the PHTL NHCH question bank for the website.

"NGÂN HÀNG CÂU HỎI PH I-2020 SỬA THEO HD 2024.docx" (Phục hình I, 8 lessons) was split into one
source file per lesson, PHTL NHCH/nguon/Bài N.txt, and fixed by hand: broken questions merged or split,
tooth charts rewritten as [rang: ...] lines, degree signs restored, exact duplicates dropped, and answers
added from the textbook where the bank marks none. This script validates those files and writes, per lesson:
  PHTL NHCH/Bài N. <tên bài>.json   - questions read by build-static.js
  PHTL NHCH/Bài N. <tên bài>.docx   - the same lesson as a Word file
  PHTL NHCH/hinh/phtl-nhch-bN-cXX.webp - tooth charts drawn from the [rang: ...] lines

Source format:
  # Bài N. Tên bài           first line, the lesson title (also the file name)
  # ...                      any other line starting with # is a comment
  Câu N. question text       numbered 1, 2, 3... in order
  | text                     one more line of the question (statements, lists)
  [hinh: file.webp]          figure from PHTL NHCH/hinh/
  [rang: 8 7 x 5 | 1 2 x x]  tooth chart, patient's right | left as written in the bank, "x" = missing tooth;
                             two jaws are separated by " / " (upper first)
  *A. option                 answer marked in the bank
  @A. option                 answer chosen by AI (the bank marks none)
  ?A. / !B.                  the bank marks A but the textbook supports B (shown with a warning badge)
  +C. option                 also correct: picking it is graded right too (with any of the marks above)
  > note                     explanation, required for @, ?/! and + answers
Questions with no marked option have no answer key and need a note saying why.
"""

import io
import json
import re
import sys
from pathlib import Path

from docx import Document
from docx.shared import Inches, Pt

ROOT = Path(__file__).resolve().parent.parent
SUBJECT = "PHTL NHCH"
FOLDER = ROOT / SUBJECT
TITLE_RE = re.compile(r"^# (Bài (\d)\. .+)$")
QUESTION_RE = re.compile(r"^Câu (\d+)\.\s+(.+)$")
OPTION_RE = re.compile(r"^([*@?!+]?)([A-F])\.\s+(.+)$")
IMAGE_RE = re.compile(r"^\[hinh: ([\w.-]+\.webp)\]$")
CHART_RE = re.compile(r"^\[rang: (.+)\]$")
TOOTH_RE = re.compile(r"^(?:[1-8]|x)$")
# A note that names options by letter ("A sai", "chọn B hay D") only reads right in the original order.
LETTER_RE = re.compile(r"(?<![\w°])[A-F](?![\w])")


def fail(path, message):
    raise SystemExit(f"{path.name}: {message}")


def parse_chart(path, number, spec):
    rows = []
    for row in spec.split(" / "):
        sides = row.split(" | ")
        if len(sides) != 2:
            fail(path, f"tooth chart row needs one ' | ' in question {number}: {row}")
        right, left = (side.split() for side in sides)
        if not all(TOOTH_RE.match(t) for t in right + left) or len(right) > 8 or len(left) > 8:
            fail(path, f"bad tooth chart in question {number}: {row}")
        rows.append((right, left))
    if len(rows) > 2:
        fail(path, f"tooth chart has more than two jaws in question {number}")
    return rows


def parse(path):
    lines = path.read_text(encoding="utf-8").splitlines()
    match = TITLE_RE.match(lines[0]) if lines else None
    if not match:
        fail(path, "first line must be '# Bài N. Tên bài'")
    title, items, current = match.group(1), [], None
    for line in lines[1:]:
        line = line.rstrip()
        if not line or line.startswith("#"):
            continue
        match = QUESTION_RE.match(line)
        if match:
            current = {"number": int(match.group(1)), "lines": [match.group(2).strip()], "options": [],
                       "marks": {}, "notes": [], "image": None, "chart": None}
            items.append(current)
            continue
        if current is None:
            fail(path, f"text before the first question: {line}")
        if line.startswith("> "):
            current["notes"].append(line[2:].strip())
            continue
        if current["options"] or current["notes"]:
            match = OPTION_RE.match(line)
            if not match or current["notes"]:
                fail(path, f"unexpected line in question {current['number']}: {line}")
        elif line.startswith("| "):
            current["lines"].append(line[2:].strip())
            continue
        else:
            image, chart = IMAGE_RE.match(line), CHART_RE.match(line)
            if image or chart:
                if current["image"] or current["chart"]:
                    fail(path, f"question {current['number']} has more than one figure")
                if image:
                    current["image"] = image.group(1)
                else:
                    current["chart"] = parse_chart(path, current["number"], chart.group(1))
                continue
            match = OPTION_RE.match(line)
            if not match:
                fail(path, f"unexpected line in question {current['number']}: {line}")
        mark, label, text = match.groups()
        if label != "ABCDEF"[len(current["options"])]:
            fail(path, f"option order differs in question {current['number']}")
        current["options"].append({"label": label, "text": text.strip()})
        if mark:
            current["marks"].setdefault(mark, []).append(len(current["options"]) - 1)
    return title, items


def resolve(path, item):
    """Turn option markers into the website's answer fields."""
    marks, note = dict(item["marks"]), " ".join(item["notes"]) or None
    if len(item["options"]) < 2:
        fail(path, f"question {item['number']} has fewer than two options")
    also = marks.pop("+", [])
    if any(len(v) > 1 for v in marks.values()) or set(marks) not in (set(), {"*"}, {"@"}, {"?", "!"}):
        fail(path, f"question {item['number']} has inconsistent answer marks {item['marks']}")
    if also and not (marks and note):
        fail(path, f"question {item['number']} has a '+' answer without a main answer and a note")
    out = {"correctIndex": None, "acceptIndices": also, "fixedOrder": bool(note and LETTER_RE.search(note)),
           "explanation": None, "ai": False, "aiCheck": False, "aiNote": None, "aiOriginal": None, "scanNote": None}
    if "*" in marks:
        out.update(correctIndex=marks["*"][0], explanation=note)
    elif "@" in marks:
        if not note:
            fail(path, f"question {item['number']} has an AI answer without a reason")
        out.update(correctIndex=marks["@"][0], ai=True, aiNote=note)
    elif "!" in marks:
        if not note:
            fail(path, f"question {item['number']} overrides the bank without a reason")
        original = item["options"][marks["?"][0]]
        out.update(correctIndex=marks["!"][0], ai=True, aiCheck=True, aiNote=note,
                   aiOriginal=f"{original['label']}. {original['text']}")
    else:
        if not note:
            fail(path, f"question {item['number']} has no answer and no note saying why")
        out["explanation"] = note
    return out


def font(size, bold=False):
    from PIL import ImageFont

    for name in (("arialbd.ttf", "DejaVuSans-Bold.ttf") if bold else ("arial.ttf", "DejaVuSans.ttf")):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def draw_chart(rows, target):
    """Dental chart: patient's right on the left half, the midline between the 1s, upper jaw on top."""
    from PIL import Image, ImageDraw

    # The site shows figures at most 320px wide, so keep the chart narrow and the digits large.
    cell, row_h, pad = 32, 46, 12
    width, height = 16 * cell + 2 * pad, len(rows) * row_h + 2 * pad
    image = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(image)
    mid = width // 2
    tooth, gap = font(29, bold=True), font(22)
    for r, (right, left) in enumerate(rows):
        y = pad + r * row_h + row_h // 2
        slots = [(mid - (len(right) - i) * cell + cell // 2, t) for i, t in enumerate(right)]
        slots += [(mid + i * cell + cell // 2, t) for i, t in enumerate(left)]
        for x, t in slots:
            missing = t == "x"
            draw.text((x, y), t, fill="#8f8f8f" if missing else "#111111",
                      font=gap if missing else tooth, anchor="mm")
    draw.line([(mid, pad - 4), (mid, height - pad + 4)], fill="#333333", width=3)
    if len(rows) == 2:
        draw.line([(pad - 4, pad + row_h), (width - pad + 4, pad + row_h)], fill="#333333", width=3)
    target.parent.mkdir(parents=True, exist_ok=True)
    image.save(target, "WEBP", lossless=True)


def create_docx(title, questions, target):
    from PIL import Image

    doc = Document()
    section = doc.sections[0]
    section.page_width, section.page_height = Inches(8.5), Inches(11)
    section.top_margin = section.bottom_margin = Inches(0.7)
    section.left_margin = section.right_margin = Inches(0.8)
    normal = doc.styles["Normal"]
    normal.font.name = "Arial"
    normal.font.size = Pt(10.5)
    normal.paragraph_format.space_after = Pt(1.5)

    run = doc.add_paragraph().add_run(f"{SUBJECT} — {title}")
    run.bold = True
    run.font.size = Pt(16)
    doc.add_paragraph("Ngân hàng câu hỏi Phục hình I (2020, sửa theo HD 2024)").runs[0].italic = True

    for q in questions:
        para = doc.add_paragraph()
        para.paragraph_format.space_before = Pt(7)
        para.paragraph_format.keep_with_next = True
        para.add_run(f"Câu {q['number']}. ").bold = True
        for i, line in enumerate(q["question"].split("\n")):
            if i:
                para.add_run().add_break()
            para.add_run(line)
        if q["image"]:
            buffer = io.BytesIO()
            Image.open(FOLDER / q["image"]["file"]).convert("RGB").save(buffer, "PNG")
            buffer.seek(0)
            doc.add_picture(buffer, width=Inches(3.2 if q["image"].get("chart") else 2.6))
        for option in q["options"]:
            line = doc.add_paragraph()
            line.paragraph_format.left_indent = Inches(0.18)
            line.add_run(f"{option['label']}. ").bold = True
            line.add_run(option["text"])
        index = q["correctIndex"]
        answer = "chưa có" if index is None else q["options"][index]["label"]
        if q["acceptIndices"]:
            answer += ", " + ", ".join(q["options"][i]["label"] for i in q["acceptIndices"]) + " (chọn phương án nào cũng đúng)"
        if q["aiCheck"]:
            answer += f" (theo giáo trình — ngân hàng chọn {q['aiOriginal']})"
        elif q["ai"]:
            answer += " (AI làm đáp án — ngân hàng không đánh)"
        doc.add_paragraph().add_run(f"Đáp án: {answer}").bold = True
        note = q["aiNote"] or q["explanation"]
        if note:
            para = doc.add_paragraph()
            para.add_run("Giải thích: ").bold = True
            para.add_run(note)
    doc.save(target)


def build_lesson(source):
    title, items = parse(source)
    lesson = TITLE_RE.match(f"# {title}").group(2)
    if source.stem != f"Bài {lesson}":
        fail(source, f"file name must be 'Bài {lesson}.txt'")
    if [q["number"] for q in items] != list(range(1, len(items) + 1)):
        fail(source, "questions must be numbered 1, 2, 3... in order")
    seen, questions, charts = {}, [], set()
    for item in items:
        question = "\n".join(item["lines"])
        key = (question.casefold(), tuple(o["text"].casefold() for o in item["options"]))
        if key in seen and not (item["image"] or item["chart"]):
            fail(source, f"question {item['number']} duplicates question {seen[key]}")
        seen[key] = item["number"]
        text = question + "".join(o["text"] for o in item["options"]) + "".join(item["notes"])
        if "�" in text or "@" in text:
            fail(source, f"broken character or leftover answer mark in question {item['number']}")
        image = None
        if item["image"]:
            if not (FOLDER / "hinh" / item["image"]).exists():
                fail(source, f"figure for question {item['number']} is missing: hinh/{item['image']}")
            image = {"file": f"hinh/{item['image']}"}
        elif item["chart"]:
            name = f"phtl-nhch-b{lesson}-c{item['number']:03d}.webp"
            draw_chart(item["chart"], FOLDER / "hinh" / name)
            charts.add(FOLDER / "hinh" / name)
            image = {"file": f"hinh/{name}", "chart": True}
        questions.append({
            "number": item["number"],
            "question": question,
            "options": item["options"],
            "image": image,
            **resolve(source, item),
        })

    (FOLDER / f"{title}.json").write_text(json.dumps({
        "title": title,
        "subject": SUBJECT,
        "source": f"{SUBJECT} Bài {lesson}",
        "header": [],
        "note": None,
        "noteLabel": None,
        "questions": questions,
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    create_docx(title, questions, FOLDER / f"{title}.docx")
    return (
        f"  {title}: {len(questions)} câu, "
        f"{sum(q['correctIndex'] is not None and not q['ai'] for q in questions)} theo ngân hàng, "
        f"{sum(q['ai'] and not q['aiCheck'] for q in questions)} AI, "
        f"{sum(q['aiCheck'] for q in questions)} sửa theo giáo trình, "
        f"{sum(bool(q['acceptIndices']) for q in questions)} nhiều đáp án, "
        f"{sum(bool(q['explanation']) for q in questions)} có ghi chú, "
        f"{sum(q['correctIndex'] is None for q in questions)} chưa có đáp án, "
        f"{sum(q['image'] is not None for q in questions)} hình"
    ), charts


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    sources = sorted((FOLDER / "nguon").glob("Bài *.txt"))
    if len(sources) != 8:
        raise SystemExit(f"expected 8 lesson files in {FOLDER / 'nguon'}, found {len(sources)}")
    report, charts = [], set()
    for source in sources:
        line, written = build_lesson(source)
        report.append(line)
        charts |= written
    # Renumbering questions leaves old chart files behind; drop every chart this run did not write.
    for stale in set((FOLDER / "hinh").glob("phtl-nhch-b*-c*.webp")) - charts:
        stale.unlink()
    print("\n".join(report))


if __name__ == "__main__":
    sys.exit(main())
