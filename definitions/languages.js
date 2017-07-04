/**
 * Created by marksarukhanov on 6/13/17.
 */

F.middleware('language', function(req, res, next, options, controller) {
    var self = this;

    var linkArr = req.url.split("/");

    if(linkArr[1] == 'en' || linkArr[1] == 'ru' || linkArr[1] == 'hy') {
        F.language = linkArr[1];
        //self.language = linkArr[1];
        req.url = linkArr.join('/');
    }
    else
    {
        F.language = 'en';
        //self.language = 'en';
    }
    next();
});