package org.pentaho.platform.plugin.services.pluginmgr;

import org.junit.Test;

import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

public class PlatformPluginTest {
  @Test
  public void testAddLifecycleListenerClassname() {
    PlatformPlugin platformPlugin = new PlatformPlugin();
    platformPlugin.addLifecycleListener( "bogus1" );
    platformPlugin.addLifecycleListener( "bogus2" );
    List<String> classnames = platformPlugin.getLifecyclelistenerList();
    assertEquals( 2, classnames.size() );
    assertTrue( classnames.contains( "bogus1" ) );
    assertTrue( classnames.contains( "bogus2" ) );
  }

  @Test
  public void testSetLifecycleListenerClassname() {
    PlatformPlugin platformPlugin = new PlatformPlugin();
    platformPlugin.setLifecycleListeners( "bogus1" );
    platformPlugin.setLifecycleListeners( "bogus2" );
    List<String> classnames = platformPlugin.getLifecyclelistenerList();
    assertEquals( 2, classnames.size() );
    assertTrue( classnames.contains( "bogus1" ) );
    assertTrue( classnames.contains( "bogus2" ) );
  }
}
