const { leetcodeGraphQL } = require('../backend/src/services/leetcodeClient');

(async () => {
  try {
    const query = `
      query introspect {
        __type(name: "QuestionFilterInput") {
          name
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

    const data = await leetcodeGraphQL(query, {});
    console.log(JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('ERR:', e);
    process.exitCode = 1;
  }
})();
