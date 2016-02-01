###*
 * TMS-black模块开发构建工具
 * @author [Pang.J.G]
 * @version [0.0.1]
 * @date  [2016-01-20 00:01:12]
 * @required [gulp]
###

fs      = require 'fs'
path    = require 'path'
gulp    = require 'gulp'
_       = require 'lodash'
crypto  = require 'crypto'
yargs   = require 'yargs'
less    = require 'gulp-less'
uglify  = require 'uglify-js'
autopre = require 'gulp-autoprefixer'
plumber = require 'gulp-plumber'
gutil   = require 'gulp-util'
log     = gutil.log
color   = gutil.colors
CleanCSS = require 'clean-css'
through2 = require 'through2'

# 设置运行的命令参数
argv = yargs.option("e", {
        alias: 'env',
        demand: true
        default: 'local',
        describe: color.cyan('项目的运行环境'),
        type: 'string'
    }).option("hash", {
        alias: 'hashlen',
        default: 10,
        describe: color.cyan('设置生产文件名的hash长度'),
        type: 'number'
    }).option("cdn", {
        default: '',
        describe: color.cyan('设置项目发布的cdn域名'),
        type: 'string'
    })
    .help('h')
    .alias('h', 'help')
    .argv

# 判断任务
tasks = argv._

# 全局的配置
_root =  process.env.INIT_CWD
defaultTasks = ['less','js','watch','default','all']
global.Cache = {}
try
  global.Cache = require '../global/globalMap.json'
catch error

# 一些正则
REGEX =
    uri: /globalUri\(('|")([^'|^"]*)(\w+).(png|gif|jpg|html|js|css)('|")\)/g
    uriVal: /\([\s\S]*?\)/
    cssBg: /url\([\S\s]*?\)/g

###*
 * base functions
###
Tools =
    # md5
    md5: (source) ->
        _buf = new Buffer(source)
        _str = _buf.toString("binary")
        return crypto.createHash('md5').update(_str, 'utf8').digest('hex')

    # make dir
    mkdirsSync: (dirpath, mode)->
        if fs.existsSync(dirpath)
            return true
        else
            if Tools.mkdirsSync path.dirname(dirpath), mode
                fs.mkdirSync(dirpath, mode)
                return true
    # 错误警报
    errHandler:(e)->
        gutil.beep()
        gutil.beep()
        log e

    # 压缩css/js源码
    minify: (source,type)->
        type = type or "js"
        if type == 'css'
            cssOpt = {
                    keepBreaks:false
                    compatibility:
                        properties:
                            iePrefixHack:true
                            ieSuffixHack:true
                }
            source = Tools._replaceCssBg(source)
            mangled = new CleanCSS(cssOpt).minify(source)
            return mangled.styles
        else
            source = Tools._replaceUriValue(source)
            mangled = uglify.minify(source,{fromString: true})
            return mangled.code

    # 获取文件
    getFileSync: (file, encoding)->
        _encoding = encoding or 'utf8'
        fileCon = ''
        if fs.existsSync(file)
            stats = fs.statSync(file)
            if stats.isFile()
                fileCon = fs.readFileSync(file, _encoding)
        return fileCon

    # 写入文件
    writeFile: (file, source,offlog)->
        # 文件存在并且MD5值一样，则不重复写入
        name = path.basename(file);
        if fs.existsSync(file) and Tools.md5(Tools.getFileSync(file)) is Tools.md5(source)
            return false
        Tools.mkdirsSync(path.dirname(file))
        fs.writeFileSync(file, source, 'utf8')
        offlog or log("'" + color.cyan(file) + "'", "build success.")

    # 获取文件夹下的一级目录列表
    getFolders: (fPath)->
        folders = []
        fs.readdirSync(fPath).forEach (v)->
            folder = path.join fPath,v
            if fs.statSync(folder).isDirectory() and v.indexOf('.') != 0
                folders.push v
        return folders

    # 生成 debug 文件路径
    _setDegbugPath: (parse)->
        parse.base = "_debug." + parse.name + parse.ext
        return path.format(parse)

    # 生成 dist 文件路径
    _setDistPath: (parse,hash)->
        parse.base = parse.name + "." + hash.substring(0,argv.hash) + parse.ext
        return path.format(parse)

    # 生成缓存的类型
    _setCacheType: (parse)->
        return parse.ext.replace('.','')

    # 从缓存中读取 dist 文件路径
    _getDistName: (type,name)->
        if _.has(global.Cache,type + "Map") and global.Cache[type + "Map"][name]
            return global.Cache[type + "Map"][name].distPath
        else
            return name
    # 替换JS中的内嵌资源
    # 例如：globalUri("dir/name.ext")-->globalUri("dir/name.md5hash.ext")
    _replaceUriValue: (source)->
        return source.replace REGEX.uri,(res)->
            _val = res.match(REGEX.uriVal).shift().replace(/[\(\)"']/g,'')
            _valArr = _val.split('/')
            type = _valArr.shift()
            name = _valArr.join('/')
            distName = Tools._getDistName(type,name)
            return res.replace(name,distName)

    # 替换css中的背景图片或字体文件引用资源
    # 例如：url('xxxxx.xxx')-->url('xxxxx.md5hash.xxx')
    _replaceCssBg: (source)->
        return source.replace REGEX.cssBg,(res)->
            _val = res.match(REGEX.uriVal).shift().replace(/[\(\)"']/g,'')
            if _val.indexOf('font/') != -1
                name = _val.split('font/')[1]
                            .split(/(\?|#)/)[0]
                distName = Tools._getDistName('font',name)
                return res.replace(name,distName)
            else if _val.indexOf('img/') != -1
                name = _val.split('img/')[1]
                distName = Tools._getDistName('img',name)
                return res.replace(name,distName)
            else
                return res
    tips:(res)->
        log "'" + color.cyan(res.path.replace(_root,'')) +  "'","was #{res.type}."

# 定义一个任务列表的容器
taskList = []

# 任务构建类
class build
    # 参数初始化
    constructor:(@taskName)->
        @srcPath = "./#{taskName}/src/"
        @distPath = "./#{taskName}/dist/"
        @curMap = "./#{taskName}/map.json"
        @env = argv.e
        # gulp任务
        @files = [
                path.join(@srcPath, '*.{less,js}')
                "!#{path.join(@srcPath, '*.coffee')}"
            ]
    # 处理css/js的pipe管道对象
    _throughObj: ->
        _this = @
        return through2.obj (file, enc, callback)->
            if file.isNull()
                return callback(null, file)
            else if file.isStream()
                throw new Error('Streams are not supported!')
            relative = file.relative
            _parse = path.parse(relative)
            _type = Tools._setCacheType(_parse)
            _contents = file.contents
            # 压缩处理
            _minContents = Tools.minify(_contents.toString(),_type)
            _hash = Tools.md5(_minContents)
            _distPath = Tools._setDistPath(_parse,_hash)

            # 生成压缩文件
            Tools.writeFile(path.join(_this.distPath,relative),_minContents)
            argv.env isnt 'local' and Tools.writeFile(path.join(_this.distPath,_distPath),_minContents)

            # 生成Debug对象
            _debugPath = Tools._setDegbugPath(_parse)
            file.path = path.join(_this.distPath,_debugPath)

            # 缓存
            global.Cache[_type + "Map"][relative] =
                hash: _hash
                distPath: _distPath

            return callback(null,file)
    # less构建
    less: (files,cb)->
        _this = @
        _cb = cb or ->
        gulp.src(files)
            .pipe plumber({errorHandler: Tools.errHandler})
            .pipe less
                compress: false
                paths: [_this.srcPath]
            .pipe autopre()
            .pipe _this._throughObj()
            .pipe gulp.dest(_this.distPath)
            .on 'end', ->
                _cb()
    # js构建
    js: (files,cb)->
        _this = @
        _cb = cb or ->
        gulp.src(files)
            .pipe plumber({errorHandler: Tools.errHandler})
            .pipe _this._throughObj()
            .pipe gulp.dest(_this.distPath)
            .on 'end',_cb

    # 注册任务
    registTask: =>
        _this = @
        taskName = _this.taskName
        _files = _this.files
        gulp.task "#{taskName}_less",->
            _this.less(path.join(_this.srcPath, "*.less"))

        gulp.task "#{taskName}_js",["#{taskName}_less"],->
            _this.js path.join(_this.srcPath, "*.js"),->

        gulp.task "#{taskName}_watch",->

            gulp.watch _files,(res)->
                _file = res.path
                _ext = path.extname(_file).replace(/^\./,'')
                _task = "#{taskName}_#{_ext}"
                Tools.tips(res)
                _this[_ext](_file)
        taskList.push taskName
        gulp.task taskName,["#{taskName}_js"],->
            _this.env is 'local' && gulp.start("#{taskName}_watch")


# 生成tasks
(->
    blocks = Tools.getFolders(_root)
    blocks.forEach (block)->
        if block not in defaultTasks and block isnt 'node_modules'
            new build(block).registTask()
)()

gulp.task 'all',->
    gulp.start taskList

gulp.task 'default',->
    console.log "请设置需要构建的项目: ",taskList.concat(['all'])
