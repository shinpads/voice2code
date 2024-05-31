// const apiKey = process.env.OPENAI_API_KEY;
require("dotenv").config({ path: __dirname + "/.env" });
const Speaker = require("speaker");

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

async function createAudioStreamFromText(text) {
  const response = await openai.audio.speech.create({
    input: text,
    speed: 1,
    voice: "onyx",
    model: "tts-1",
    response_format: "wav",
  });
  return response.body;
}

async function streamAudio(audioStream) {
  // stream audio chunk by chunk
  const speaker = new Speaker({
    channels: 1, // 2 channels
    bitDepth: 16, // 16-bit samples
    sampleRate: 24000, // 44,100 Hz sample rate
    format: 8,
  });
  // iterate over audio stream in chunk sizes of 1024
  let skip = 1;
  for await (const chunk of audioStream) {
    if (skip > 0) {
      skip--;
      continue;
    }
    speaker.write(chunk);
  }
}

module.exports = {
  createChatCompletion,
  transcribeAudio,
  createAudioStreamFromText,
  streamAudio,
};
