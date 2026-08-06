const newman = require('newman');

newman.run({
    collection: require('./collection/apicollection.json'),
    environment: require('./collection/environment.json'),
    reporters: ['cli', 'htmlextra'],
    reporter: {
        htmlextra: {
            export: './collection/Reports/report.html'
        }
    }
});