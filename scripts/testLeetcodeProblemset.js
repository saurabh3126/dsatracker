const { fetchProblemsetQuestions } = require('../backend/src/services/leetcodeClient');

(async () => {
  try {
    const res = await fetchProblemsetQuestions({
      limit: 5,
      skip: 0,
      tagSlugs: ['array'],
    });

    console.log('total:', res.total);
    console.log('items:', res.items.length);
    console.log(res.items.map((x) => ({ title: x.title, slug: x.slug, difficulty: x.difficulty })));
  } catch (e) {
    console.error('ERR:', e);
    process.exitCode = 1;
  }
})();
