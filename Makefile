
jquery.console.min.js: jquery.console.js
	echo "/* Copyright 2019, more info: https://pat.sh/projects/js-console/ */" > jquery.console.min.js
	uglifyjs --timings -m -c < jquery.console.js >> jquery.console.min.js

