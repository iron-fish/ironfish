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
};
