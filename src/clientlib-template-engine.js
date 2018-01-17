import * as _ from 'lodash';

const defaultTemplateStr = '<?xml version="1.0" encoding="UTF-8"?> \n\
<jcr:root xmlns:cq="http://www.day.com/jcr/cq/1.0" xmlns:jcr="http://www.jcp.org/jcr/1.0" \n\
    jcr:primaryType="cq:ClientLibraryFolder" \n\
    categories="[<%= categoryName %>]" \n\
    dependencies="[<%= dependencies %>]"/>';

export default class ClientlibTemplateEngine {
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
