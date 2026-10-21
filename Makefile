# Twitch VOD Sync — build targets
#
# Requires Node.js/npm. Packaging uses electron-builder.
# Note: you can only build the OS's own targets reliably:
#   - Windows -> win
#   - Linux   -> linux (AppImage/deb/rpm/pacman/tar.gz; rpm needs `rpm`, pacman needs `bsdtar`)
#   - macOS   -> mac (dmg/zip)
# Cross-building Windows from Linux needs wine; macOS builds require macOS.

.PHONY: help install start dist win linux mac clean

help:
	@echo "make install   - install dependencies"
	@echo "make start     - run the app in development"
	@echo "make dist      - package for the current OS"
	@echo "make win       - package Windows (nsis + portable)"
	@echo "make linux     - package Linux (AppImage, deb, rpm, pacman, tar.gz)"
	@echo "make mac       - package macOS (dmg + zip)"
	@echo "make clean     - remove dist/ output"

install:
	npm install

start:
	npm start

dist:
	npm run dist

win:
	npm run dist:win

linux:
	npm run dist:linux

mac:
	npm run dist:mac

clean:
	rm -rf dist
