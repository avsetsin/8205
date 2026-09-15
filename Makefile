.PHONY: check serve

check:
	node --check main.js
	python3 -c "import xml.etree.ElementTree as ET; ET.parse('sitemap.xml')"
	node scripts/qa.mjs
	node --test scripts/eva-support.test.mjs

serve:
	python3 -m http.server 4173 --bind 127.0.0.1
