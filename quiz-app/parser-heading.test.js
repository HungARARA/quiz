const assert = require("node:assert/strict");
const test = require("node:test");

const { flattenHtml, parseQuestionsFromHtml } = require("./server.js");

test("standalone Word headings separate questions without entering options", () => {
  const html = [
    "<h1>Kiến thức cơ bản</h1>",
    "<p>Câu 1. Dòng nào đúng?</p>",
    "<p>A. Sai</p>",
    "<p>B. Đúng</p>",
    "<p>Đáp án: B</p>",
    "<p>Giải thích: Câu đầu.</p>",
    "<h1>Vận dụng</h1>",
    "<p>Câu 2. Chọn đáp án phù hợp?</p>",
    "<p>A. Lựa chọn được</p>",
    "<p>viết tiếp trên dòng sau</p>",
    "<p>B. Lựa chọn khác</p>",
    "<p>Đáp án: A</p>",
    "<h2>Tình huống mở rộng</h2>",
    "<p>Câu 3. Đáp án nào đúng?</p>",
    "<p>A. Có</p>",
    "<p>B. Không</p>",
    "<p>Đáp án: A</p>",
  ].join("");

  const lines = flattenHtml(html);
  assert.equal(lines.find((line) => line.text === "Vận dụng").isHeading, true);

  const { questions, stats } = parseQuestionsFromHtml(html);
  assert.equal(questions.length, 3);
  assert.equal(stats.skipped, 0);
  assert.equal(questions[0].options[1].text, "Đúng");
  assert.equal(questions[0].explanation, "Câu đầu.");
  assert.equal(
    questions[1].options[0].text,
    "Lựa chọn được viết tiếp trên dòng sau",
  );
  assert.equal(questions[2].options[1].text, "Không");
  assert.equal(
    questions.some((question) =>
      JSON.stringify(question).includes("Tình huống mở rộng"),
    ),
    false,
  );
});

test("a question styled as a heading still supplies its stem", () => {
  const html = [
    "<h2>Câu 1. Dòng nào đúng?</h2>",
    "<p>A. Có</p>",
    "<p>B. Không</p>",
    "<p>Đáp án: A</p>",
  ].join("");
  const { questions } = parseQuestionsFromHtml(html);
  assert.equal(questions.length, 1);
  assert.equal(questions[0].question, "Dòng nào đúng?");
});
