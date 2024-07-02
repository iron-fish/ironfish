const { ESLintUtils } = require("@typescript-eslint/utils");

function getTypeName(parserServices, checker, node) {
  const originalNode = parserServices.esTreeNodeToTSNodeMap.get(node);
  const nodeType = checker.getTypeAtLocation(originalNode);
  return checker.typeToString(nodeType);
}

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
  "no-buffer-cmp": {
    create(context) {
      return {
        BinaryExpression: function (node) {
          const parserServices = ESLintUtils.getParserServices(context);
          const checker = parserServices.program.getTypeChecker();

          const leftType = getTypeName(parserServices, checker, node.left);
          const rightType = getTypeName(parserServices, checker, node.right);

          if (leftType === "Buffer" || rightType === "Buffer") {
            context.report({
              node,
              message:
                "Incorrect comparison of Buffers. Use Buffer.equals or Buffer.compare instead.",
            });
          }
        },
      };
    },
  },
  "no-promise-race": {
    create(context) {
      return {
        MemberExpression: function (node) {
          if (node.object.name === 'Promise' && node.property.name === 'race') {
            context.report({
              node,
              message:
                "Promise.race leaks memory. You can work around it by using PromiseUtils.split to pass resolve/reject to other Promises. See https://github.com/nodejs/node/issues/17469#issuecomment-685216777 for more details.",
            });
          }
        },
      };
    },
  },
};
