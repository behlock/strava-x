const tsconfigPaths = require('tsconfig-paths');

const baseUrl = './'; // Specify the base directory for module resolution, adjust if necessary
const { paths } = require('./tsconfig.json').compilerOptions;

tsconfigPaths.register({
  baseUrl,
  paths,
});
