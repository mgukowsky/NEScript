// Karma configuration
// Generated on Tue Oct 27 2015 22:36:57 GMT-0400 (Eastern Daylight Time)

module.exports = function(config) {
  config.set({

    // base path that will be used to resolve all patterns (eg. files, exclude)
    basePath: '',


    // frameworks to use
    // available frameworks: https://npmjs.org/browse/keyword/karma-adapter
    frameworks: ['jasmine'],


    // list of files / patterns to load in the browser
    files: [
      'src/js/*.js',
      'test/RAM.test.js',
      'test/cpu.test.js',
      'test/ppu.test.js',
      'test/rom.test.js',
      'test/mappers.test.js',
      'test/controller.test.js'
    ],


    // list of files to exclude
    exclude: [
    ],


    // preprocess matching files before serving them to the browser
    // available preprocessors: https://npmjs.org/browse/keyword/karma-preprocessor
    preprocessors: {
    },


    // test results reporter to use
    // possible values: 'dots', 'progress'
    // available reporters: https://npmjs.org/browse/keyword/karma-reporter
    reporters: ['mocha'],

    mochaReporter: {
      output: 'full',
      colors: {
        success: 'green',
        info: 'blue',
        warning: 'yellow',
        error: 'red'
      }
    },

    pluguns: [
      'karma-jasmine',
      'karma-mocha-reporter'
    ],
    // web server port
    port: 9876,


    // enable / disable colors in the output (reporters and logs)
    colors: true,


    // level of logging
    // possible values: config.LOG_DISABLE || config.LOG_ERROR || config.LOG_WARN || config.LOG_INFO || config.LOG_DEBUG
    logLevel: config.LOG_INFO,


    // enable / disable watching file and executing tests whenever any file changes
    autoWatch: false,


    // start these browsers
    // available browser launchers: https://npmjs.org/browse/keyword/karma-launcher
    browsers: ['Chrome', 'Firefox', 'IE'],

    //Opera is funky w/karma, but it should be able to do everything Chrome does,
    //since recent releases also use V8
    //browsers: ['Chrome', 'Firefox', 'IE', 'Opera'],


    // Continuous Integration mode
    // if true, Karma captures browsers, runs the tests and exits
    singleRun: true,

    // Concurrency level
    // how many browser should be started simultanous
    concurrency: 3
  })
}
