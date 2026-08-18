// Decoy vocabulary for the recognizer's grammar.
//
// Each sentence is decoded against a grammar of just its own words, which is
// what makes recognition of a young voice accurate. But a grammar that narrow is
// dangerous on its own: if the only choices are five target words and "[unk]",
// speech that is nothing like any of them still gets forced onto whichever
// target word is acoustically nearest, and the balloon rises for words the child
// never said. Measured on a 5-word sentence with no decoys, roughly 3 of 5 words
// leaked through 30 seconds of completely unrelated speech.
//
// These high-frequency words are always in the grammar, so wrong speech has
// somewhere plausible to land instead. They are common enough to be in the
// model's dictionary and phonetically spread out.

export const DECOY_WORDS = [
  'about', 'after', 'again', 'air', 'all', 'also', 'always', 'am', 'american',
  'animal', 'another', 'answer', 'any', 'are', 'around', 'as', 'ask', 'away',
  'baby', 'back', 'bad', 'ball', 'be', 'because', 'bed', 'been', 'before',
  'began', 'begin', 'being', 'below', 'best', 'better', 'between', 'black',
  'blue', 'boat', 'body', 'book', 'both', 'box', 'boy', 'bring', 'brought',
  'build', 'but', 'by', 'call', 'came', 'car', 'carry', 'change', 'child',
  'children', 'city', 'clean', 'close', 'cold', 'come', 'could', 'country',
  'cut', 'day', 'did', 'different', 'do', 'does', 'done', 'door', 'down',
  'draw', 'drink', 'dry', 'during', 'each', 'early', 'earth', 'eat', 'end',
  'enough', 'even', 'ever', 'every', 'example', 'eye', 'face', 'fall', 'family',
  'far', 'farm', 'father', 'feel', 'feet', 'few', 'find', 'fire', 'first',
  'fish', 'five', 'fly', 'follow', 'food', 'foot', 'form', 'found', 'four',
  'friend', 'from', 'front', 'full', 'game', 'gave', 'get', 'girl', 'give',
  'go', 'going', 'gold', 'gone', 'good', 'got', 'great', 'green', 'group',
  'grow', 'had', 'half', 'hand', 'hard', 'has', 'have', 'head', 'hear',
  'heard', 'help', 'her', 'here', 'high', 'him', 'his', 'hold', 'home',
  'horse', 'hot', 'hour', 'house', 'how', 'however', 'hundred', 'idea', 'if',
  'important', 'in', 'inside', 'into', 'is', 'it', 'its', 'just', 'keep',
  'kind', 'king', 'knew', 'know', 'land', 'large', 'last', 'late', 'later',
  'learn', 'leave', 'left', 'less', 'let', 'letter', 'life', 'light', 'like',
  'line', 'list', 'little', 'live', 'long', 'look', 'lot', 'loud', 'love',
  'made', 'make', 'man', 'many', 'may', 'me', 'mean', 'men', 'might', 'mile',
  'milk', 'mind', 'money', 'month', 'more', 'morning', 'most', 'mother',
  'mountain', 'move', 'much', 'must', 'name', 'near', 'need', 'never', 'new',
  'next', 'night', 'no', 'north', 'nothing', 'now', 'number', 'of', 'off',
  'often', 'oh', 'old', 'once', 'only', 'open', 'or', 'order', 'other', 'our',
  'out', 'over', 'own', 'page', 'paper', 'part', 'party', 'people', 'perhaps',
  'person', 'picture', 'piece', 'place', 'plant', 'play', 'point', 'poor',
  'put', 'question', 'quick', 'rain', 'ran', 'read', 'ready', 'real', 'really',
  'red', 'rest', 'right', 'river', 'road', 'rock', 'room', 'round', 'run',
  'said', 'same', 'saw', 'say', 'school', 'sea', 'second', 'seem', 'seen',
  'sentence', 'set', 'seven', 'shall', 'she', 'ship', 'short', 'should',
  'show', 'side', 'since', 'sing', 'sit', 'six', 'sky', 'sleep', 'slow',
  'small', 'snow', 'so', 'some', 'something', 'sometimes', 'song', 'soon',
  'sound', 'south', 'space', 'speak', 'stand', 'start', 'state', 'stay',
  'still', 'stone', 'stop', 'story', 'street', 'strong', 'such', 'sure',
  'table', 'take', 'talk', 'teacher', 'tell', 'ten', 'than', 'thank', 'that',
  'their', 'them', 'then', 'there', 'these', 'they', 'thing', 'think', 'third',
  'this', 'those', 'though', 'thought', 'three', 'through', 'time', 'today',
  'together', 'told', 'too', 'took', 'top', 'town', 'tree', 'try', 'turn',
  'two', 'under', 'until', 'up', 'upon', 'us', 'use', 'very', 'walk', 'want',
  'warm', 'was', 'watch', 'water', 'way', 'we', 'week', 'well', 'went',
  'were', 'what', 'when', 'where', 'which', 'while', 'white', 'who', 'why',
  'wide', 'will', 'wind', 'window', 'wish', 'with', 'without', 'woman',
  'wonder', 'word', 'work', 'world', 'would', 'write', 'wrong', 'year',
  'yellow', 'yes', 'yet', 'you', 'young', 'your',
];
