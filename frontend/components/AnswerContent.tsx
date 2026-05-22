import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type QuizQuestion = {
  prompt: string;
  options: { key: string; text: string }[];
  answer: string;
  explanation: string;
};

export function AnswerContent({ content }: { content: string }) {
  const cleaned = cleanSourceMarkers(content);
  const quiz = useMemo(() => parseQuiz(cleaned), [cleaned]);

  if (quiz.length) {
    return <QuizContent questions={quiz} />;
  }

  return <MarkdownContent content={cleaned} />;
}

function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="answer-markdown break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ children, ...props }) => (
            <a {...props} target="_blank" rel="noreferrer" className="underline decoration-black/30 underline-offset-2 hover:decoration-black">
              {children}
            </a>
          ),
          code: ({ className, children, ...props }) =>
            className ? (
              <code {...props} className={`${className} font-mono text-[0.92em]`}>
                {children}
              </code>
            ) : (
              <code {...props} className="rounded bg-[var(--soft)] px-1 py-0.5 font-mono text-[0.92em]">
                {children}
              </code>
            ),
          pre: ({ children }) => (
            <pre className="scrollbar-thin my-3 overflow-x-auto rounded-lg border border-[var(--line)] bg-[#111] p-3 text-sm leading-6 text-white">
              {children}
            </pre>
          ),
          table: ({ children }) => (
            <div className="scrollbar-thin my-3 overflow-x-auto rounded-lg border border-[var(--line)]">
              <table className="min-w-full border-collapse text-left text-sm">{children}</table>
            </div>
          ),
          th: ({ children }) => <th className="border-b border-[var(--line)] bg-[var(--soft)] px-3 py-2 font-semibold">{children}</th>,
          td: ({ children }) => <td className="border-b border-[var(--line)] px-3 py-2 align-top last:border-b-0">{children}</td>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function QuizContent({ questions }: { questions: QuizQuestion[] }) {
  const [selected, setSelected] = useState<Record<number, string>>({});

  return (
    <div className="space-y-4">
      <div>
        <p className="text-base font-semibold">Quiz</p>
        <p className="mt-1 text-xs text-[var(--muted)]">Choose an answer to check it against the document.</p>
      </div>
      {questions.map((question, index) => {
        const choice = selected[index];
        const correct = choice === question.answer;
        return (
          <section key={`${question.prompt}-${index}`} className="rounded-lg border border-[var(--line)] bg-[var(--soft)] p-3">
            <p className="font-semibold">
              {index + 1}. {question.prompt}
            </p>
            <div className="mt-3 grid gap-2">
              {question.options.map((option) => {
                const optionSelected = choice === option.key;
                const optionCorrect = choice && option.key === question.answer;
                return (
                  <button
                    key={option.key}
                    type="button"
                    className={`rounded-lg border px-3 py-2 text-left transition ${
                      optionSelected && correct
                        ? "border-emerald-600 bg-emerald-50 text-emerald-900"
                        : optionSelected
                          ? "border-red-500 bg-red-50 text-red-900"
                          : optionCorrect
                            ? "border-emerald-400 bg-white text-emerald-900"
                            : "border-[var(--line)] bg-white hover:border-black"
                    }`}
                    onClick={() => setSelected((current) => ({ ...current, [index]: option.key }))}
                  >
                    <span className="mr-2 font-semibold">{option.key}.</span>
                    {option.text}
                  </button>
                );
              })}
            </div>
            {choice ? (
              <div className={`mt-3 rounded-lg border px-3 py-2 ${correct ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-900"}`}>
                <p className="font-semibold">{correct ? "Correct." : `Wrong. Correct answer: ${question.answer}.`}</p>
                {question.explanation ? <p className="mt-1 text-sm leading-6">{question.explanation}</p> : null}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

function parseQuiz(content: string): QuizQuestion[] {
  const sections = content.split(/^###\s+Question\s+\d+\s*$/gim).slice(1);
  const questions = sections.map((section) => {
    const lines = section
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const answerLine = lines.find((line) => /^Correct answer:\s*[A-D]\b/i.test(line));
    const explanationLine = lines.find((line) => /^Explanation:/i.test(line));
    const optionLines = lines.filter((line) => /^[A-D][.)]\s+/.test(line));
    const prompt = lines.find((line) => !/^([A-D][.)]\s+|Correct answer:|Explanation:)/i.test(line)) || "";
    const answer = answerLine?.match(/^Correct answer:\s*([A-D])\b/i)?.[1]?.toUpperCase() || "";
    const options = optionLines.map((line) => {
      const match = line.match(/^([A-D])[.)]\s+(.+)$/);
      return { key: match?.[1] || "", text: match?.[2] || "" };
    });
    return {
      prompt,
      options,
      answer,
      explanation: explanationLine?.replace(/^Explanation:\s*/i, "") || "",
    };
  });
  return questions.filter((question) => question.prompt && question.answer && question.options.length >= 2);
}

function cleanSourceMarkers(content: string) {
  return content
    .replace(/\[source\s+(\d+)\s*\|\s*chunk\s+[^\]]+\]/gi, "[Source $1]")
    .replace(/\[source\s+(\d+)\]\s*:/gi, "[Source $1]")
    .replace(/\[source\s+(\d+)\]/gi, "[Source $1]");
}
