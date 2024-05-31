// const apiKey = process.env.OPENAI_API_KEY;
require("dotenv").config({ path: __dirname + "/.env" });
const OpenAI = require("openai");
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function createChatCompletion(prompt) {
  console.log("calling");
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: prompt },
    ],
  });
  return completion.choices[0].message.content;
}

module.exports = {
  createChatCompletion,
};
