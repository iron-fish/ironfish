const { rules } = require("./index");
const { RuleTester } = require("eslint");

const ruleTester = new RuleTester({
  parserOptions: { ecmaVersion: 6, sourceType: "module" },
});

ruleTester.run("no-vague-imports", rules["no-vague-imports"], {
  valid: [
    "import foo from './foo'",
    "import foo from '../foo'",
    "import foo from '../../foo'",
  ],
  invalid: [
    {
      code: "import foo from '.'",
      errors: [{ message: /specific/i }],
    },
    {
      code: "import foo from '..'",
      errors: [{ message: /specific/i }],
    },
    {
      code: "import foo from '../..'",
      errors: [{ message: /specific/i }],
    },
  ],
});
