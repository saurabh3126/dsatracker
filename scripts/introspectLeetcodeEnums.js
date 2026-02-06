const { leetcodeGraphQL } = require('../backend/src/services/leetcodeClient');

async function introspectEnum(name) {
  const query = `
    query enumInfo($name: String!) {
      __type(name: $name) {
        name
        kind
        enumValues {
          name
        }
      }
    }
  `;

  const data = await leetcodeGraphQL(query, { name });
  return data?.__type;
}

(async () => {
  try {
    const types = ['QuestionFilterCombineTypeEnum', 'FilterOperatorEnum', 'DifficultyDescribedEnum'];
    for (const t of types) {
      const info = await introspectEnum(t);
      console.log(`\n=== ${t} ===`);
      console.log(JSON.stringify(info, null, 2));
    }
  } catch (e) {
    console.error('ERR:', e);
    process.exitCode = 1;
  }
})();
