const fs = require('fs');
const path = require('path');

const API_KEY = process.env.ELEVENLABS_API_KEY;
if (!API_KEY) {
  console.error('Error: ELEVENLABS_API_KEY environment variable is missing.');
  process.exit(1);
}

const SOUNDS_DIR = path.join(__dirname, '..', 'assets', 'sounds');
if (!fs.existsSync(SOUNDS_DIR)) {
  fs.mkdirSync(SOUNDS_DIR, { recursive: true });
}

const SOUND_PROMPTS = [
  { file: 'meow1.mp3', text: 'a cute domestic cat meowing gently', duration: 1.2 },
  { file: 'meow2.mp3', text: 'a happy little kitten cheerful high pitched meow', duration: 1.0 },
  { file: 'purr.mp3', text: 'a cat purring softly and happily very close up', duration: 2.8 },
  { file: 'hiss.mp3', text: 'a startled cat hissing sharply', duration: 1.0 },
  { file: 'pounce.mp3', text: 'a soft gentle landing pounce sound', duration: 0.7 },
];

async function generateSound({ file, text, duration }) {
  const dest = path.join(SOUNDS_DIR, file);
  console.log(`Generating ${file}: "${text}"...`);

  const response = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
    method: 'POST',
    headers: {
      'xi-api-key': API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      duration_seconds: duration,
      prompt_influence: 0.35,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to generate ${file}: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  fs.writeFileSync(dest, Buffer.from(arrayBuffer));
  console.log(`Saved ${file} (${Math.round(arrayBuffer.byteLength / 1024)} KB)`);
}

async function main() {
  for (const sound of SOUND_PROMPTS) {
    try {
      await generateSound(sound);
    } catch (err) {
      console.error(err.message);
    }
  }
  console.log('All sounds processed!');
}

main();
