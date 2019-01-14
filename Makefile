.PHONY: all

all: js-console.min.js js-console.min.css

js-console.min.css: js-console.css
	python3 -mrcssmin < js-console.css > js-console.min.css

js-console.min.js: js-console.js
	echo "/* Copyright 2019, more info: https://pat.sh/projects/js-console/ */" > js-console.min.js
	uglifyjs --timings -m -c < js-console.js >> js-console.min.js

