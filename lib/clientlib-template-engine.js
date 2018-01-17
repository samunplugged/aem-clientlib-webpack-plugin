'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _lodash = require('lodash');

var _ = _interopRequireWildcard(_lodash);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

var defaultTemplateStr = '<?xml version="1.0" encoding="UTF-8"?> \n\
<jcr:root xmlns:cq="http://www.day.com/jcr/cq/1.0" xmlns:jcr="http://www.jcp.org/jcr/1.0" \n\
    jcr:primaryType="cq:ClientLibraryFolder" \n\
    categories="[<%= categoryName %>]" \n\
    dependencies="[<%= dependencies %>]"/>';

class ClientlibTemplateEngine {
  constructor(_templateStr, _templateSettings) {
    if (typeof _templateSettings === 'object') {
      _.templateSettings(_templateSettings);
    }
    this.templateStr = _templateStr || defaultTemplateStr;
  }
  compile(_templateStr) {
    return _.template(_templateStr || this.templateStr);
  }
  interpolate(_templateStr, _values) {
    return this.compile(_templateStr)(_values);
  }
}
exports.default = ClientlibTemplateEngine;