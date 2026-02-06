const { leetcodeGraphQL } = require('../backend/src/services/leetcodeClient');

async function introspectInput(name) {
  const query = `
    query introspect($name: String!) {
      __type(name: $name) {
        name
        kind
        inputFields {
          name
          type {
            kind
            name
            ofType {
              kind
              name
              ofType {
                kind
                name
              }
            }
          }
        }
      }
    }
  `;

  const data = await leetcodeGraphQL(query, { name });
  return data?.__type;
}

(async () => {
  try {
    const types = ['QuestionTopicFilter', 'QuestionDifficultyFilter'];
    for (const t of types) {
      const info = await introspectInput(t);
      console.log(`\n=== ${t} ===`);
      console.log(JSON.stringify(info, null, 2));
    }
  } catch (e) {
    console.error('ERR:', e);
    process.exitCode = 1;
  }
})();
