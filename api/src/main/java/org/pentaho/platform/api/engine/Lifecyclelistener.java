package org.pentaho.platform.api.engine;

import java.util.List;

public class Lifecyclelistener {
    public List<Property> getProperties() {
        return properties;
    }

    public void setProperties(List<Property> properties) {
        this.properties = properties;
    }

    public List<Property> properties;

    public String get_class() {
        return _class;
    }

    public void set_class(String _class) {
        this._class = _class;
    }

    public String _class;
}

