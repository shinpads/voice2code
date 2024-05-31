// const apiKey = process.env.OPENAI_API_KEY;
require("dotenv").config({ path: __dirname + "/.env" });

const fs = require("fs");
const OpenAI = require("openai");
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function createChatCompletion(prompt, jsonMode = false) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: prompt },
    ],
    response_format: { type: jsonMode ? "json_object" : "text" },
  });
  return completion.choices[0].message.content;
}

async function transcribeAudio(audioFilePath) {
  console.log("Reading audio file:", audioFilePath);
  console.log("Sending audio file to OpenAI for transcription...");

  try {
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(audioFilePath),
      model: "whisper-1",
    });
    console.log("Received transcription from OpenAI:", transcription.text);
    return transcription.text;
  } catch (error) {
    console.error("Error during transcription:", error);
    throw error;
  }
}

module.exports = {
  createChatCompletion,
  transcribeAudio,
};
