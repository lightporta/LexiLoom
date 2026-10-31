/* Original illustrative entries, not licensed Oxford/Cambridge dictionary data. */
(() => {
  const entries = {
    serendipity: ['ˌser.ənˈdɪp.ə.ti', 'noun', '意外发现美好事物的幸运；不期而遇的惊喜', 'The pleasant luck of discovering something valuable while looking for something else.', 'A chance conversation led to a new friendship — a little serendipity.', '一次偶然的交谈带来了一段新友谊——小小的幸运邂逅。', '常用搭配：a moment of serendipity；不可数名词。'],
    luminous: ['ˈluː.mɪ.nəs', 'adjective', '发光的；明亮的', 'Giving off a soft light or seeming bright and clear.', 'The luminous moon guided us along the quiet path.', '明亮的月亮指引我们走过安静的小径。', '常放在名词前：a luminous sky；也可作表语：the dial is luminous。'],
    ephemeral: ['ɪˈfem.ər.əl', 'adjective', '短暂的；转瞬即逝的', 'Lasting for only a short time.', 'We stopped to enjoy the ephemeral colours of the evening sky.', '我们停下来欣赏傍晚天空转瞬即逝的色彩。', '常形容瞬间、体验或现象：ephemeral beauty。'],
    curiosity: ['ˌkjʊə.riˈɒs.ə.ti', 'noun', '好奇心；求知欲', 'A wish to explore, ask questions, and learn more.', 'Her curiosity turned a short walk into an afternoon of discovery.', '她的好奇心让一次短途散步变成了一下午的探索。', '常用搭配：out of curiosity（出于好奇）；curiosity about something。'],
    language: ['ˈlæŋ.ɡwɪdʒ', 'noun', '语言；表达方式', 'A system people use to communicate meaning through words or signs.', 'Learning a language can open a window into another culture.', '学习一门语言可以打开了解另一种文化的窗口。', '可数：learn a new language；不可数：the study of language。'],
    wander: ['ˈwɒn.dər', 'verb', '漫步；闲逛；走神', 'To move without a fixed route, or let your thoughts move freely.', 'We like to wander through the bookshop on rainy afternoons.', '下雨的午后，我们喜欢在书店里随意逛逛。', 'wander through / around；注意与 wonder（想知道）区分。'],
    loom: ['luːm', 'noun', '织布机', 'A frame or machine used to weave threads into fabric.', 'The artist wove a small landscape on her wooden loom.', '艺术家用她的木织机织出了一幅小小的风景。', '作动词时还可表示隐约出现，或某事即将来临。'],
    bloom: ['bluːm', 'verb', '开花；蓬勃发展', 'To produce flowers or begin to flourish.', 'New ideas bloom when people share their questions.', '人们交流疑问时，新的想法便会萌发。', '作名词可表示花朵；in bloom 表示正在开花。'],
    resilient: ['rɪˈzɪl.i.ənt', 'adjective', '有韧性的；能够恢复的', 'Able to recover and adapt after difficulty.', 'A resilient garden returns to life after a cold winter.', '有韧性的花园在寒冬过后恢复了生机。', '常用搭配：resilient communities；resilient to change。'],
    connect: ['kəˈnekt', 'verb', '连接；联系；产生共鸣', 'To join things or bring people and ideas into a relationship.', 'Stories connect readers across languages.', '故事将不同语言的读者连接起来。', 'connect A to / with B；connect with someone。'],
    apple: ['ˈæp.əl', 'noun', '苹果', 'A round fruit that grows on a tree and usually has crisp flesh.', 'She packed an apple and a book for the train journey.', '她为火车旅途带上了一个苹果和一本书。', '可数名词：an apple；复数：apples。'],
    hello: ['həˈləʊ', 'exclamation', '你好；喂', 'A friendly word used when greeting someone or starting a conversation.', 'He waved from the doorway and said hello.', '他在门口挥手说了声你好。', 'say hello to someone；也可用于接听电话。']
  };
  globalThis.LexiLoomDemo = Object.freeze({
    words: Object.keys(entries),
    lookup(word) {
      const item = entries[word];
      const source = { id: 'demo', name: '本地演示 · 自编词条', url: '' };
      if (!item) return { word, status: 'error', source, error: { code: 'demo-miss', message: '演示词库未收录此词，请切换在线词典。' } };
      const [phonetic, partOfSpeech, translation, definition, text, exampleTranslation, usage] = item;
      return { word, status: 'ok', phonetic, pronunciations: [{ label: '示例音标', phonetic }],
        meanings: [{ partOfSpeech, definitions: [{ definition, translation, examples: [{ text, translation: exampleTranslation }], usage }] }], source };
    }
  });
})();
