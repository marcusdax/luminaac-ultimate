// LuminAAC vocabulary and plans.
// Word classes map to the modified Fitzgerald Key colors in tokens.css.
// Core words keep a fixed position so motor plans never break;
// only the "next" row changes with context.

export const CORE = [
  // row 1
  { w: "I", c: "people", e: "🙋" },
  { w: "want", c: "action", e: "🤲" },
  { w: "go", c: "action", e: "🚶" },
  { w: "stop", c: "negate", e: "✋", p: 7196 },
  { w: "help", c: "action", e: "🆘" },
  { w: "more", c: "describe", e: "➕" },
  // row 2
  { w: "you", c: "people", e: "👉" },
  { w: "like", c: "action", e: "👍" },
  { w: "eat", c: "action", e: "🍽️" },
  { w: "not", c: "negate", e: "🚫" },
  { w: "drink", c: "action", e: "🥤" },
  { w: "all done", c: "social", e: "🏁", p: 28429 },
  // row 3
  { w: "we", c: "people", e: "👥" },
  { w: "need", c: "action", e: "❗" },
  { w: "play", c: "action", e: "🧸" },
  { w: "don't", c: "negate", e: "🙅" },
  { w: "look", c: "action", e: "👀" },
  { w: "that", c: "little", e: "👆" },
  // row 4
  { w: "my", c: "people", e: "🫴" },
  { w: "feel", c: "action", e: "💭" },
  { w: "open", c: "action", e: "📭" },
  { w: "big", c: "describe", e: "🐘" },
  { w: "little", c: "describe", e: "🐭" },
  { w: "here", c: "little", e: "📍" },
  // row 5
  { w: "what", c: "question", e: "❓" },
  { w: "where", c: "question", e: "🗺️" },
  { w: "yes", c: "social", e: "✅" },
  { w: "no", c: "negate", e: "❌", p: 5526 },
  { w: "please", c: "social", e: "🙏" },
  { w: "thank you", c: "social", e: "💛" },
];

export const FOLDERS = [
  {
    id: "feelings", label: "Feelings", e: "😊",
    words: [
      { w: "happy", c: "describe", e: "😊" }, { w: "sad", c: "describe", e: "😢" },
      { w: "angry", c: "describe", e: "😠" }, { w: "scared", c: "describe", e: "😨" },
      { w: "tired", c: "describe", e: "🥱" }, { w: "calm", c: "describe", e: "😌" },
      { w: "excited", c: "describe", e: "🤩" }, { w: "frustrated", c: "describe", e: "😤" },
      { w: "overwhelmed", c: "describe", e: "🌀" }, { w: "sick", c: "describe", e: "🤒" },
      { w: "hurt", c: "describe", e: "🤕" }, { w: "bored", c: "describe", e: "😐" },
    ],
  },
  {
    id: "needs", label: "Body & needs", e: "🫶",
    words: [
      { w: "bathroom", c: "thing", e: "🚻" }, { w: "a break", c: "thing", e: "⏸️" },
      { w: "quiet", c: "describe", e: "🤫" }, { w: "headphones", c: "thing", e: "🎧" },
      { w: "a hug", c: "thing", e: "🤗" }, { w: "space", c: "thing", e: "↔️" },
      { w: "too loud", c: "describe", e: "🔊" }, { w: "too bright", c: "describe", e: "🔆" },
      { w: "hungry", c: "describe", e: "🍽️" }, { w: "thirsty", c: "describe", e: "💧" },
      { w: "sleep", c: "action", e: "😴" }, { w: "itchy", c: "describe", e: "🧴" },
    ],
  },
  {
    id: "food", label: "Food & drink", e: "🍎",
    words: [
      { w: "water", c: "thing", e: "💧" }, { w: "juice", c: "thing", e: "🧃" },
      { w: "milk", c: "thing", e: "🥛" }, { w: "snack", c: "thing", e: "🍪" },
      { w: "apple", c: "thing", e: "🍎" }, { w: "banana", c: "thing", e: "🍌" },
      { w: "crackers", c: "thing", e: "🍘" }, { w: "sandwich", c: "thing", e: "🥪" },
      { w: "pizza", c: "thing", e: "🍕" }, { w: "pasta", c: "thing", e: "🍝" },
      { w: "cereal", c: "thing", e: "🥣" }, { w: "chicken", c: "thing", e: "🍗" },
    ],
  },
  {
    id: "people", label: "People", e: "👨‍👩‍👧",
    words: [
      { w: "mom", c: "people", e: "👩" }, { w: "dad", c: "people", e: "👨" },
      { w: "teacher", c: "people", e: "🧑‍🏫" }, { w: "friend", c: "people", e: "🧒" },
      { w: "brother", c: "people", e: "👦" }, { w: "sister", c: "people", e: "👧" },
      { w: "grandma", c: "people", e: "👵" }, { w: "grandpa", c: "people", e: "👴" },
      { w: "doctor", c: "people", e: "🧑‍⚕️" }, { w: "me", c: "people", e: "🙋" },
      { w: "everyone", c: "people", e: "👥" }, { w: "nobody", c: "people", e: "⭕" },
    ],
  },
  {
    id: "places", label: "Places", e: "🏠",
    words: [
      { w: "home", c: "thing", e: "🏠" }, { w: "school", c: "thing", e: "🏫" },
      { w: "outside", c: "thing", e: "🌳" }, { w: "park", c: "thing", e: "🛝" },
      { w: "store", c: "thing", e: "🛒" }, { w: "car", c: "thing", e: "🚗" },
      { w: "bed", c: "thing", e: "🛏️" }, { w: "kitchen", c: "thing", e: "🍳" },
      { w: "my room", c: "thing", e: "🚪" }, { w: "pool", c: "thing", e: "🏊" },
      { w: "library", c: "thing", e: "📚" }, { w: "bus", c: "thing", e: "🚌" },
    ],
  },
  {
    id: "things", label: "Things", e: "🧸",
    words: [
      { w: "tablet", c: "thing", e: "📱" }, { w: "music", c: "thing", e: "🎵" },
      { w: "book", c: "thing", e: "📖" }, { w: "ball", c: "thing", e: "⚽" },
      { w: "blocks", c: "thing", e: "🧱" }, { w: "TV", c: "thing", e: "📺" },
      { w: "blanket", c: "thing", e: "🧣" }, { w: "shoes", c: "thing", e: "👟" },
      { w: "coat", c: "thing", e: "🧥" }, { w: "toy", c: "thing", e: "🧸" },
      { w: "drawing", c: "thing", e: "🖍️" }, { w: "swing", c: "thing", e: "🎠" },
    ],
  },
  {
    id: "talk", label: "Chat", e: "💬",
    words: [
      { w: "hi", c: "social", e: "👋" }, { w: "bye", c: "social", e: "👋" },
      { w: "my turn", c: "social", e: "☝️" }, { w: "your turn", c: "social", e: "👉" },
      { w: "wait", c: "social", e: "⏳" }, { w: "again", c: "describe", e: "🔁" },
      { w: "I don't know", c: "social", e: "🤷" }, { w: "funny", c: "describe", e: "😂" },
      { w: "who", c: "question", e: "🧑" }, { w: "when", c: "question", e: "🕒" },
      { w: "why", c: "question", e: "🤔" }, { w: "how", c: "question", e: "🔧" },
    ],
  },
];

// Quick phrases sit outside the grid: one tap, spoken immediately.
export const QUICK = [
  { w: "I need a break", c: "negate", e: "⏸️" },
  { w: "Help me please", c: "action", e: "🆘" },
  { w: "Yes", c: "social", e: "✅" },
  { w: "No", c: "negate", e: "❌" },
  { w: "Wait, I'm still talking", c: "social", e: "✋" },
];

// 5-point scale, adapted from common self-regulation scales.
export const SCALE = [
  { n: 1, label: "Calm", say: "I feel calm", hue: "action" },
  { n: 2, label: "Okay", say: "I feel okay", hue: "describe" },
  { n: 3, label: "Wobbly", say: "I'm starting to feel upset", hue: "people" },
  { n: 4, label: "Big feelings", say: "I'm upset. I need help", hue: "thing" },
  { n: 5, label: "Too much", say: "It's too much. I need a break now", hue: "negate" },
];

export const CALM_NEEDS = [
  { w: "Quiet, please", e: "🤫" },
  { w: "I need space", e: "↔️" },
  { w: "Squeeze my hands", e: "🤲" },
  { w: "Headphones, please", e: "🎧" },
  { w: "Water, please", e: "💧" },
  { w: "I want to go home", e: "🏠" },
];

// Plans: step-by-step visual scripts (the "Lunascript" idea from the
// original repo). Each step offers phrases to say in that moment.
export const PLANS = [
  {
    id: "grocery", title: "Grocery store", e: "🛒",
    steps: [
      { t: "Get a cart", e: "🛒", say: ["Can I push the cart?", "I want to hold the list"] },
      { t: "Find food on the list", e: "📝", say: ["Where is it?", "I found it!", "Can we get this?"] },
      { t: "Wait in line", e: "⏳", say: ["How long?", "It's too loud", "I need my headphones"] },
      { t: "Pay", e: "💳", say: ["Hello", "Thank you"] },
      { t: "Go to the car", e: "🚗", say: ["All done", "I did it!"] },
    ],
  },
  {
    id: "restaurant", title: "Restaurant", e: "🍽️",
    steps: [
      { t: "Sit at the table", e: "🪑", say: ["Can I sit here?", "I want a different seat"] },
      { t: "Look at the menu", e: "📖", say: ["What is that?", "I want to choose"] },
      { t: "Order food", e: "🗣️", say: ["I would like pizza, please", "I would like water, please", "No ice, please"] },
      { t: "Wait for food", e: "⏳", say: ["How long?", "Can I draw?", "I need a break"] },
      { t: "Eat", e: "🍝", say: ["This is good", "I don't like it", "More, please"] },
      { t: "Leave", e: "👋", say: ["All done", "Thank you", "Bye"] },
    ],
  },
  {
    id: "doctor", title: "Doctor visit", e: "🩺",
    steps: [
      { t: "Check in", e: "📋", say: ["Hello", "My name is…"] },
      { t: "Wait in the waiting room", e: "⏳", say: ["How long?", "Can I use my tablet?"] },
      { t: "Meet the doctor", e: "🧑‍⚕️", say: ["Hi", "Please tell me first", "Is it going to hurt?"] },
      { t: "Check-up", e: "🩺", say: ["Stop, please", "It hurts here", "I'm okay"] },
      { t: "Go home", e: "🏠", say: ["All done", "I was brave"] },
    ],
  },
];
