const { rules } = require("./index");
const { ESLintUtils } = require("@typescript-eslint/utils");

// Remove this once https://github.com/typescript-eslint/typescript-eslint/pull/4656 has been released
global.afterAll = () => {};

const ruleTester = new ESLintUtils.RuleTester({
  parserOptions: {
    project: "./tsconfig.json",
    tsconfigRootDir: __dirname,
  },
  parser: "@typescript-eslint/parser",
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

ruleTester.run("no-buffer-cmp", rules["no-buffer-cmp"], {
  valid: ["[1] === [1]", "1 >= 1", "false == true", "null != undefined"],
  invalid: [
    {
      code: "Buffer.alloc(1) == false",
      errors: [{ message: /Incorrect comparison of Buffers/i }],
    },
    {
      code: "null === Buffer.alloc(1)",
      errors: [{ message: /Incorrect comparison of Buffers/i }],
    },
    {
      code: "Buffer.alloc(1) <= Buffer.alloc(1)",
      errors: [{ message: /Incorrect comparison of Buffers/i }],
    },
    {
      code: "const x = Buffer.alloc(1); x > 0",
      errors: [{ message: /Incorrect comparison of Buffers/i }],
    },
  ],
});

ruleTester.run("no-unassigned-expr", rules["no-unassigned-expr"], {
  valid: [
    `
      const foo = [1, 2, 3]
      const x = foo.filter((f) => f === 999)
    `,
    `
      function bar() {
        const foo = [1, 2, 3]
        return foo.flatMap((f) => f === 999)
      }
    `,
  ],
  invalid: [
    {
      code: `
        const foo = [1, 2, 3]
        foo.filter((f) => f === 999)
      `,
      errors: [{ message: /Return value is unused/i }],
    },
    {
      code: `
        const foo = [1,2,3]
        foo.flatMap((f) => f === 999)
      `,
      errors: [{ message: /Return value is unused/i }],
    },
  ],
});
