// Package logger —— zap 日志(gopherforge shared/pkg/logger 模式:console + 可选文件双写)。
package logger

import (
	"os"
	"path/filepath"

	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
	"gopkg.in/natefinch/lumberjack.v2"
)

var L *zap.SugaredLogger

// InitLogger 初始化全局日志(level: debug|info|warn|error;output: std|file;dir: 文件目录)。
func InitLogger(level, output, dir string) error {
	lvl := zapcore.InfoLevel
	switch level {
	case "debug":
		lvl = zapcore.DebugLevel
	case "warn":
		lvl = zapcore.WarnLevel
	case "error":
		lvl = zapcore.ErrorLevel
	}
	encCfg := zap.NewProductionEncoderConfig()
	encCfg.TimeKey = "ts"
	encCfg.EncodeTime = zapcore.ISO8601TimeEncoder

	consoleSink := zapcore.AddSync(os.Stdout)
	consoles := zapcore.NewCore(
		zapcore.NewConsoleEncoder(encCfg), consoleSink, lvl)

	var cores []zapcore.Core
	cores = append(cores, consoles)
	if output == "file" {
		if dir != "" {
			_ = os.MkdirAll(dir, 0o755)
		}
		fileSink := zapcore.AddSync(&lumberjack.Logger{
			Filename:   filepath.Join(dir, "go-techbase.log"),
			MaxSize:    100, // MB
			MaxBackups: 7,
			MaxAge:     28, // days
			Compress:   true,
		})
		cores = append(cores, zapcore.NewCore(
			zapcore.NewJSONEncoder(encCfg), fileSink, lvl))
	}

	z := zap.New(zapcore.NewTee(cores...), zap.AddCaller(), zap.AddCallerSkip(1))
	L = z.Sugar()
	return nil
}

// 兼容便捷方法(初始化前调用退化为静默)。

func Infof(format string, args ...any) {
	if L != nil {
		L.Infof(format, args...)
	}
}

func Warnf(format string, args ...any) {
	if L != nil {
		L.Warnf(format, args...)
	}
}

func Errorf(format string, args ...any) {
	if L != nil {
		L.Errorf(format, args...)
	}
}

func Debugf(format string, args ...any) {
	if L != nil {
		L.Debugf(format, args...)
	}
}

func Fatalf(format string, args ...any) {
	if L != nil {
		L.Fatalf(format, args...)
	}
}
