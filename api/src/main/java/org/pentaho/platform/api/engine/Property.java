package org.pentaho.platform.api.engine;

public class Property {
    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String name;
    public int value;

    public int getValue() {
        return value;
    }

    public void setValue(int value) {
        this.value = value;
    }


}
