NEWSCHEMA('titleTranslation').make(function(schema) {
	schema.define('en', 'String(256)', true);
	schema.define('ru', 'String(256)', true);
	schema.define('hy', 'String(256)', true);
});
NEWSCHEMA('headerTranslation').make(function(schema) {
    schema.define('en', 'String(256)', true);
    schema.define('ru', 'String(256)', true);
    schema.define('hy', 'String(256)', true);
});
NEWSCHEMA('descriptionTranslation').make(function(schema) {
    schema.define('en', 'String(256)', true);
    schema.define('ru', 'String(256)', true);
    schema.define('hy', 'String(256)', true);
});

NEWSCHEMA('Slider').make(function(schema) {
	schema.define('id', 'String(20)');
    schema.define('title', 'titleTranslation');
    schema.define('header', 'headerTranslation');
    schema.define('description', 'descriptionTranslation');
    schema.define('link', 'String(256)');
    schema.define('picture', 'String(256)');

	// Gets listing
	schema.setQuery(function(error, options, callback) {

		options.page = U.parseInt(options.page) - 1;
		options.max = U.parseInt(options.max, 20);

		if (options.id && typeof(options.id) === 'string')
			options.id = options.id.split(',');

		if (options.page < 0)
			options.page = 0;

		var take = U.parseInt(options.max);
		var skip = U.parseInt(options.page * options.max);
		var filter = NOSQL('slides').find();

		filter.sort('id', true);

		filter.fields('id', 'title', 'header', 'description', 'link', 'picture');

		filter.skip(skip);
		filter.take(take);
		filter.callback(function(err, docs, count) {

			for (var i = 0, length = docs.length; i < length; i++) {
				var doc = docs[i];
				doc.body = undefined;
			}

			var data = {};
			data.count = count;
			data.items = docs;
			data.limit = options.max;
			data.pages = Math.ceil(data.count / options.max) || 1;
			data.page = options.page + 1;

			callback(data);
		});
	});

	// Saves the product into the database
	schema.setSave(function(error, model, options, callback, controller) {

		var newbie = model.id ? false : true;
		var nosql = NOSQL('slides');

		if (newbie) {
			newbie = true;
			model.id = UID();
			model.datecreated = F.datetime;
			model.admincreated = controller.user.name;
		} else {
			model.dateupdated = F.datetime;
			model.adminupdated = controller.user.name;
		}

		//model.linker = ((model.reference ? model.reference + '-' : '') + (model.name.en || model.name)).slug();
		//model.search = ((model.title.en || model.title) + ' ' + (model.reference || '')).keywords(true, true).join(' ').max(500);
		//model.body = model.template ? U.minifyHTML(model.body) : '';

		(newbie ? nosql.insert(model) : nosql.modify(model).where('id', model.id)).callback(function() {

			F.emit('slides.save', model);
			callback(SUCCESS(true));

			model.datebackup = F.datetime;
			NOSQL('slides_backup').insert(model);

			if (!options || !options.importing)
				refresh_cache();
		});

	});

	// Gets a specific category
	schema.setGet(function(error, model, options, callback) {

		var filter = NOSQL('slides').one();
		options.id && filter.where('id', options.id);

		filter.callback(function(err, doc) {
			!doc && error.push('error-404-category');
			callback(doc);
		});
	});

	// Removes category
	schema.setRemove(function(error, id, callback) {
		NOSQL('slides').remove(F.path.databases('slides_removed.nosql')).where('id', id).callback(callback);
		refresh_cache();
	});

	// Clears product database
	schema.addWorkflow('clear', function(error, model, options, callback) {
		NOSQL('slides').remove(F.path.databases('slides_removed.nosql')).callback(refresh_cache);
		callback(SUCCESS(true));
	});

	// Refreshes categories
	schema.addWorkflow('refresh', function(error, model, options, callback) {
		refresh_cache();
		callback(SUCCESS(true));
	});

});

function refresh_cache() {
	setTimeout2('cache', () => F.cache.removeAll('cache.'), 2000);
	setTimeout2('slides', refresh, 1000);
}

function refresh() {

    var db_slides = [];

    var prepare_slide = function(slide) {
        db_slides.push(slide);
    };

    NOSQL('slides').find().prepare(prepare_slide).callback(function(){

    	console.log(db_slides);

        F.global.slides = db_slides;

    });

}

F.on('settings', refresh);
