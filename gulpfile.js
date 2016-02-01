
/**
 * TMS-black模块开发构建工具
 * @author [Pang.J.G]
 * @version [0.0.1]
 * @date  [2016-01-20 00:01:12]
 * @required [gulp]
 */
var CleanCSS, REGEX, Tools, argv, autopre, build, color, crypto, defaultTasks, error, fs, gulp, gutil, less, log, path, plumber, taskList, tasks, through2, uglify, yargs, _, _root,
  __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; },
  __indexOf = [].indexOf || function(item) { for (var i = 0, l = this.length; i < l; i++) { if (i in this && this[i] === item) return i; } return -1; };

fs = require('fs');

path = require('path');

gulp = require('gulp');

_ = require('lodash');

crypto = require('crypto');

yargs = require('yargs');

less = require('gulp-less');

uglify = require('uglify-js');

autopre = require('gulp-autoprefixer');

plumber = require('gulp-plumber');

gutil = require('gulp-util');

log = gutil.log;

color = gutil.colors;

CleanCSS = require('clean-css');

through2 = require('through2');

argv = yargs.option("e", {
  alias: 'env',
  demand: true,
  "default": 'local',
  describe: color.cyan('项目的运行环境'),
  type: 'string'
}).option("hash", {
  alias: 'hashlen',
  "default": 10,
  describe: color.cyan('设置生产文件名的hash长度'),
  type: 'number'
}).option("cdn", {
  "default": '',
  describe: color.cyan('设置项目发布的cdn域名'),
  type: 'string'
}).help('h').alias('h', 'help').argv;

tasks = argv._;

_root = process.env.INIT_CWD;

defaultTasks = ['less', 'js', 'watch', 'default', 'all'];

global.Cache = {};

try {
  global.Cache = require('../global/globalMap.json');
} catch (_error) {
  error = _error;
}

REGEX = {
  uri: /globalUri\(('|")([^'|^"]*)(\w+).(png|gif|jpg|html|js|css)('|")\)/g,
  uriVal: /\([\s\S]*?\)/,
  cssBg: /url\([\S\s]*?\)/g
};


/**
 * base functions
 */

Tools = {
  md5: function(source) {
    var _buf, _str;
    _buf = new Buffer(source);
    _str = _buf.toString("binary");
    return crypto.createHash('md5').update(_str, 'utf8').digest('hex');
  },
  mkdirsSync: function(dirpath, mode) {
    if (fs.existsSync(dirpath)) {
      return true;
    } else {
      if (Tools.mkdirsSync(path.dirname(dirpath), mode)) {
        fs.mkdirSync(dirpath, mode);
        return true;
      }
    }
  },
  errHandler: function(e) {
    gutil.beep();
    gutil.beep();
    return log(e);
  },
  minify: function(source, type) {
    var cssOpt, mangled;
    type = type || "js";
    if (type === 'css') {
      cssOpt = {
        keepBreaks: false,
        compatibility: {
          properties: {
            iePrefixHack: true,
            ieSuffixHack: true
          }
        }
      };
      source = Tools._replaceCssBg(source);
      mangled = new CleanCSS(cssOpt).minify(source);
      return mangled.styles;
    } else {
      source = Tools._replaceUriValue(source);
      mangled = uglify.minify(source, {
        fromString: true
      });
      return mangled.code;
    }
  },
  getFileSync: function(file, encoding) {
    var fileCon, stats, _encoding;
    _encoding = encoding || 'utf8';
    fileCon = '';
    if (fs.existsSync(file)) {
      stats = fs.statSync(file);
      if (stats.isFile()) {
        fileCon = fs.readFileSync(file, _encoding);
      }
    }
    return fileCon;
  },
  writeFile: function(file, source, offlog) {
    var name;
    name = path.basename(file);
    if (fs.existsSync(file) && Tools.md5(Tools.getFileSync(file)) === Tools.md5(source)) {
      return false;
    }
    Tools.mkdirsSync(path.dirname(file));
    fs.writeFileSync(file, source, 'utf8');
    return offlog || log("'" + color.cyan(file) + "'", "build success.");
  },
  getFolders: function(fPath) {
    var folders;
    folders = [];
    fs.readdirSync(fPath).forEach(function(v) {
      var folder;
      folder = path.join(fPath, v);
      if (fs.statSync(folder).isDirectory() && v.indexOf('.') !== 0) {
        return folders.push(v);
      }
    });
    return folders;
  },
  _setDegbugPath: function(parse) {
    parse.base = "_debug." + parse.name + parse.ext;
    return path.format(parse);
  },
  _setDistPath: function(parse, hash) {
    parse.base = parse.name + "." + hash.substring(0, argv.hash) + parse.ext;
    return path.format(parse);
  },
  _setCacheType: function(parse) {
    return parse.ext.replace('.', '');
  },
  _getDistName: function(type, name) {
    if (_.has(global.Cache, type + "Map") && global.Cache[type + "Map"][name]) {
      return global.Cache[type + "Map"][name].distPath;
    } else {
      return name;
    }
  },
  _replaceUriValue: function(source) {
    return source.replace(REGEX.uri, function(res) {
      var distName, name, type, _val, _valArr;
      _val = res.match(REGEX.uriVal).shift().replace(/[\(\)"']/g, '');
      _valArr = _val.split('/');
      type = _valArr.shift();
      name = _valArr.join('/');
      distName = Tools._getDistName(type, name);
      return res.replace(name, distName);
    });
  },
  _replaceCssBg: function(source) {
    return source.replace(REGEX.cssBg, function(res) {
      var distName, name, _val;
      _val = res.match(REGEX.uriVal).shift().replace(/[\(\)"']/g, '');
      if (_val.indexOf('font/') !== -1) {
        name = _val.split('font/')[1].split(/(\?|#)/)[0];
        distName = Tools._getDistName('font', name);
        return res.replace(name, distName);
      } else if (_val.indexOf('img/') !== -1) {
        name = _val.split('img/')[1];
        distName = Tools._getDistName('img', name);
        return res.replace(name, distName);
      } else {
        return res;
      }
    });
  },
  tips: function(res) {
    return log("'" + color.cyan(res.path.replace(_root, '')) + "'", "was " + res.type + ".");
  }
};

taskList = [];

build = (function() {
  function build(taskName) {
    this.taskName = taskName;
    this.registTask = __bind(this.registTask, this);
    this.srcPath = "./" + taskName + "/src/";
    this.distPath = "./" + taskName + "/dist/";
    this.curMap = "./" + taskName + "/map.json";
    this.env = argv.e;
    this.files = [path.join(this.srcPath, '*.{less,js}'), "!" + (path.join(this.srcPath, '*.coffee'))];
  }

  build.prototype._throughObj = function() {
    var _this;
    _this = this;
    return through2.obj(function(file, enc, callback) {
      var relative, _contents, _debugPath, _distPath, _hash, _minContents, _parse, _type;
      if (file.isNull()) {
        return callback(null, file);
      } else if (file.isStream()) {
        throw new Error('Streams are not supported!');
      }
      relative = file.relative;
      _parse = path.parse(relative);
      _type = Tools._setCacheType(_parse);
      _contents = file.contents;
      _minContents = Tools.minify(_contents.toString(), _type);
      _hash = Tools.md5(_minContents);
      _distPath = Tools._setDistPath(_parse, _hash);
      Tools.writeFile(path.join(_this.distPath, relative), _minContents);
      argv.env !== 'local' && Tools.writeFile(path.join(_this.distPath, _distPath), _minContents);
      _debugPath = Tools._setDegbugPath(_parse);
      file.path = path.join(_this.distPath, _debugPath);
      global.Cache[_type + "Map"][relative] = {
        hash: _hash,
        distPath: _distPath
      };
      return callback(null, file);
    });
  };

  build.prototype.less = function(files, cb) {
    var _cb, _this;
    _this = this;
    _cb = cb || function() {};
    return gulp.src(files).pipe(plumber({
      errorHandler: Tools.errHandler
    })).pipe(less({
      compress: false,
      paths: [_this.srcPath]
    })).pipe(autopre()).pipe(_this._throughObj()).pipe(gulp.dest(_this.distPath)).on('end', function() {
      return _cb();
    });
  };

  build.prototype.js = function(files, cb) {
    var _cb, _this;
    _this = this;
    _cb = cb || function() {};
    return gulp.src(files).pipe(plumber({
      errorHandler: Tools.errHandler
    })).pipe(_this._throughObj()).pipe(gulp.dest(_this.distPath)).on('end', _cb);
  };

  build.prototype.registTask = function() {
    var taskName, _files, _this;
    _this = this;
    taskName = _this.taskName;
    _files = _this.files;
    gulp.task("" + taskName + "_less", function() {
      return _this.less(path.join(_this.srcPath, "*.less"));
    });
    gulp.task("" + taskName + "_js", ["" + taskName + "_less"], function() {
      return _this.js(path.join(_this.srcPath, "*.js"), function() {});
    });
    gulp.task("" + taskName + "_watch", function() {
      return gulp.watch(_files, function(res) {
        var _ext, _file, _task;
        _file = res.path;
        _ext = path.extname(_file).replace(/^\./, '');
        _task = "" + taskName + "_" + _ext;
        Tools.tips(res);
        return _this[_ext](_file);
      });
    });
    taskList.push(taskName);
    return gulp.task(taskName, ["" + taskName + "_js"], function() {
      return _this.env === 'local' && gulp.start("" + taskName + "_watch");
    });
  };

  return build;

})();

(function() {
  var blocks;
  blocks = Tools.getFolders(_root);
  return blocks.forEach(function(block) {
    if (__indexOf.call(defaultTasks, block) < 0 && block !== 'node_modules') {
      return new build(block).registTask();
    }
  });
})();

gulp.task('all', function() {
  return gulp.start(taskList);
});

gulp.task('default', function() {
  return console.log("请设置需要构建的项目: ", taskList.concat(['all']));
});
