const { leetcodeGraphQL } = require('../backend/src/services/leetcodeClient');

(async () => {
  try {
    const query = `
      query {
        __type(name: "Query") {
          fields {
            name
            args {
              name
              type {
                kind
                name
                ofType {
                  kind
                  name
                  ofType { kind name }
                }
              }
            }
          }
        }
      }
    `;

    const data = await leetcodeGraphQL(query, {});
    const fields = data?.__type?.fields || [];
    const target = fields.find((f) => f.name === 'problemsetQuestionListV2');
    console.log(JSON.stringify(target, null, 2));
  } catch (e) {
    console.error('ERR:', e);
    process.exitCode = 1;
  }
})();
