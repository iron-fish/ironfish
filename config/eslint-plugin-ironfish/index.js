module.exports.rules = {
  "no-vague-imports": {
    create(context) {
      return {
        ImportDeclaration: function (node) {
          if (/\.$/.test(node.source.value)) {
            context.report({
              node,
              message: "Non-specific import. Import a specific file.",
            });
          }
        },
      };
    },
  },
};
