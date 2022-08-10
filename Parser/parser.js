const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const parseFromJson = require('./parseFromJson');

yargs(hideBin(process.argv))
  .command(
    'parse [in] [out]',
    'parse the json',
    (yargs) => {
      return yargs
        .positional('in', {
          describe: 'Input path',
          default: './data/poa-events1.json',
        })
        .positional('out', {
          describe: 'Output path',
          default: '../App/public/parsedCompressed.zip',
        });
    },
    (argv) => {
      if (argv.instruct) {
        console.info(
          "Run this command to parse a json file. 'in' is the output file path, 'out' is the output file path. The result is a compressed .zip"
        );
        console.info("'node parser.js parse in out'");
      } else {
        parseFromJson(argv.in, argv.out);
      }
    }
  )
  .option('instruct', {
    type: 'boolean',
    description: 'print instructions',
  })
  .parse();
