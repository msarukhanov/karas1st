Controller.prototype.getLang = function() {
    return this.url.split("/")[1];
};
Controller.prototype.translateText = function(text) {
    return text[this.url.split("/")[1]];
};
Controller.prototype.langChangeLink = function(lang) {
    var linkArr = this.url.split("/"); linkArr[1] = lang;
    return linkArr.join("/");
};
Controller.prototype.toSlug = function(str) {
    var self = str.toLowerCase().removeDiacritics();
    var builder = '';
    var length = self.length;

    for (var i = 0; i < length; i++) {
        var c = self[i];
        var code = self.charCodeAt(i);

        if (builder.length >= 60)
            break;

        if (code > 31 && code < 48) {
            if (builder[builder.length - 1] !== '-')
                builder += '-';
            continue;
        }

        if ((code > 47 && code < 58) || (code > 94 && code < 123))
            builder += c;
    }
    var l = builder.length - 1;
    return builder[l] === '-' ? builder.substring(0, l) : builder;
};

exports.install = function() {
	// COMMON
    F.use('language', '*', ['web']);

    F.route('', redirect_homepage, ['#language']);
    F.route('/', redirect_homepage, ['#language']);
    F.route('/en/', view_homepage, ['#language']);
    F.route('/ru/', view_homepage, ['#language']);
    F.route('/hy/', view_homepage, ['#language']);

	F.route('/en/contact', view_contact);
    F.route('/ru/contact', view_contact);
    F.route('/hy/contact', view_contact);
	// UI tests
	F.route('/design/', 'design');

	// CMS rendering
	F.route('/*', view_page);

	// FILES
	F.file('/images/small/*.jpg', file_image);
	F.file('/images/large/*.jpg', file_image);
	F.file('/download/', file_read);
};

// ==========================================================================
// COMMON
// ==========================================================================

function redirect_homepage() {
    var self = this;
    self.redirect('/en/');
    //self.page('/', 'index', {}, false, true);
}

// Homepage
function view_homepage() {
	var self = this;
	// Increases the performance (1 minute cache)
	self.memorize('cache.homepage', '1 minute', DEBUG, function() {
		var options = {};
		options.max = 12;
		options.sort = '3';
		GETSCHEMA('Product').query(options, function(err, response) {
			// Finds "homepage"
            response.items = _.map(response.items, function(p){
                if(p.description)
                    p.description = p.description[F.language] || p.description;
                if(p.name)
                    p.name = p.name[F.language] || p.name;
                return p;
            });

			self.page('/', '/eshop/index', response, false, true);
		});
	});
}

// Contact with contact form
function view_contact() {
	var self = this;
	self.render(self.url);
}

// ==========================================================================
// CMS (Content Management System)
// ==========================================================================

function view_page() {
	var self = this;
	// models/pages.js --> Controller.prototype.render()
	self.render(self.url);
}

// ==========================================================================
// FILES
// ==========================================================================

// Reads a specific file from database
// For images (jpg, gif, png) supports percentual resizing according "?s=NUMBER" argument in query string e.g.: .jpg?s=50, .jpg?s=80 (for image galleries)
// URL: /download/*.*
function file_read(req, res) {

	var id = req.split[1].replace('.' + req.extension, '');

	if (!req.query.s || (req.extension !== 'jpg' && req.extension !== 'gif' && req.extension !== 'png')) {
		// Reads specific file by ID
		F.exists(req, res, function(next, filename) {
			NOSQL('files').binary.read(id, function(err, stream, header) {

				if (err) {
					next();
					return res.throw404();
				}

				var writer = require('fs').createWriteStream(filename);

				CLEANUP(writer, function() {
					res.file(filename);
					next();
				});

				stream.pipe(writer);
			});
		});
		return;
	}

	// Custom image resizing
	var size;

	// Small hack for the file cache.
	// F.exists() uses req.uri.pathname for creating temp identificator and skips all query strings by creating (because this hack).
	if (req.query.s) {
		size = req.query.s.parseInt();
		req.uri.pathname = req.uri.pathname.replace('.', size + '.');
	}

	// Below method checks if the file exists (processed) in temporary directory
	// More information in total.js documentation
	F.exists(req, res, 10, function(next, filename) {

		// Reads specific file by ID
		NOSQL('files').binary.read(id, function(err, stream, header) {

			if (err) {
				next();
				return res.throw404();
			}

			var writer = require('fs').createWriteStream(filename);

			CLEANUP(writer, function() {

				// Releases F.exists()
				next();

				// Image processing
				res.image(filename, function(image) {
					image.output(req.extension);
					req.extension === 'jpg' && image.quality(85);
					size && image.resize(size + '%');
					image.minify();
				});
			});

			stream.pipe(writer);
		});
	});
}

// Reads specific picture from database
// URL: /images/small|large/*.jpg
function file_image(req, res) {

	// Below method checks if the file exists (processed) in temporary directory
	// More information in total.js documentation
	F.exists(req, res, 10, function(next, filename) {

		// Reads specific file by ID
		NOSQL('files').binary.read(req.split[2].replace('.jpg', ''), function(err, stream, header) {

			if (err) {
				next();
				return res.throw404();
			}

			var writer = require('fs').createWriteStream(filename);

			CLEANUP(writer, function() {

				// Releases F.exists()
				next();

				// Image processing
				res.image(filename, function(image) {
					image.output('jpg');
					image.quality(100);

					// if (req.split[1] === 'large')
					// 	image.miniature(500, 300);
					// else
					// 	image.miniature(200, 150);

					image.minify();
				});
			});

			stream.pipe(writer);
		});
	});
}