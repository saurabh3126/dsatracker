const { leetcodeGraphQL } = require('../backend/src/services/leetcodeClient');

(async () => {
  try {
    const query = `
      query {
        __type(name: "ProblemSetQuestionListNode") {
          name
          kind
          fields {
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
    `;

    const data = await leetcodeGraphQL(query, {});
    console.log(JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('ERR:', e);
    process.exitCode = 1;
  }
})();
