import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import dotenv from "dotenv";
import OpenAI from "openai";
import { fileURLToPath } from "url";
import { systemPrompt, buildUserPrompt } from "./prompts.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = __dirname;
const inputDir = path.join(root, "input");
const outputDir = path.join(root, "output");

if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const OPENAI_TRANSCRIBE_MODEL = process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-transcribe";
const OPENAI_JUDGE_MODEL = process.env.OPENAI_JUDGE_MODEL || "gpt-4o";
const ELEVENLABS_MODEL_ID = process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2";

const judges = JSON.parse(fs.readFileSync(path.join(root, "judges.json"), "utf8").replace(/^\uFEFF/, ""));
const questions = JSON.parse(fs.readFileSync(path.join(root, "questions.json"), "utf8").replace(/^\uFEFF/, "")).questions;

function run(cmd, args) {
  const res = spawnSync(cmd, args, { stdio: "inherit" });
  if (res.status !== 0) throw new Error(`Command failed: ${cmd} ${args.join(" ")}`);
}

async function transcribe(filePath) {
  const file = fs.createReadStream(filePath);
  const result = await openai.audio.transcriptions.create({
    model: OPENAI_TRANSCRIBE_MODEL,
    file
  });
  return result.text || "";
}

async function judgeAnswer(question, transcript) {
  const outputs = [];
  for (const j of judges) {
    const userPrompt = buildUserPrompt(
      j.promptStyle,
      `Question:\n${question.prompt}\n\nMarking guide:\n${question.rubric}`,
      transcript
    );

    const response = await openai.chat.completions.create({
      model: OPENAI_JUDGE_MODEL,
      temperature: 0.7,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ]
    });

    const parsed = JSON.parse(response.choices[0].message.content);
    outputs.push({ judge: j, result: parsed });
  }
  return outputs;
}

async function elevenTts(text, voiceEnvKey, outPath) {
  const voiceId = process.env[voiceEnvKey];
  if (!voiceId) throw new Error(`Missing voice env var: ${voiceEnvKey}`);

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": process.env.ELEVENLABS_API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      text,
      model_id: ELEVENLABS_MODEL_ID,
      output_format: "mp3_44100_128"
    })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ElevenLabs error: ${err}`);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(outPath, buf);
}

async function main() {
  const files = fs.readdirSync(inputDir).filter(f =>
    f.toLowerCase().endsWith(".mp4") ||
    f.toLowerCase().endsWith(".webm") ||
    f.toLowerCase().endsWith(".wav") ||
    f.toLowerCase().endsWith(".mp3")
  );

  if (!files.length) {
    console.error("Place one answer file in ./input first.");
    process.exit(1);
  }

  const inputFile = path.join(inputDir, files[0]);
  console.log("Using input:", inputFile);

  console.log("\n1/4 Transcribing...");
  const transcript = await transcribe(inputFile);
  fs.writeFileSync(path.join(outputDir, "transcript.txt"), transcript, "utf8");

  const question = questions[0];
  console.log("2/4 Judging question:", question.label);
  const judgeOutputs = await judgeAnswer(question, transcript);
  fs.writeFileSync(path.join(outputDir, "judges.json"), JSON.stringify(judgeOutputs, null, 2));

  console.log("3/4 Generating judge voices...");
  const audioFiles = [];

  for (const item of judgeOutputs) {
    const base = `${item.judge.id}-q${question.id}`;
    const outPath = path.join(outputDir, `${base}.mp3`);
    await elevenTts(item.result.spoken_feedback, item.judge.voiceEnv, outPath);
    audioFiles.push({ judge: item.judge, file: outPath });
  }

  console.log("4/4 Stitching judge audio...");
  const listPath = path.join(outputDir, "concat.txt");
  fs.writeFileSync(
    listPath,
    audioFiles.map(a => `file '${a.file.replace(/'/g, "'\\''")}'`).join("\n")
  );

  const stitched = path.join(outputDir, "round1-judges.mp3");
  run("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", stitched]);

  console.log("\nDone. Check output for transcript.txt, judges.json, and round1-judges.mp3.");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

