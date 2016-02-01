# TMS-block组件库开发构建工具
--------------
by Pang.J.G

## 创建配置config.json

```json
{
    "env": "local",
    "hashLen": 10,
    "cdnDomain": "tmstatics.xxx.com"
}

```
## 使用

### 安装依赖
```
npm install
```

### 查看命令

```
gulp -h  # 查看构建命令支持的参数
gulp -T  # 查看gulp支持的任务
```

### 开发和发布

```
gulp init  # 初始化项目

gulp  # 进入开发状态

gulp --e test # 发布test

gulp --e rc # 发布rc

gulp --e www # 发布生产
```

## The End.
