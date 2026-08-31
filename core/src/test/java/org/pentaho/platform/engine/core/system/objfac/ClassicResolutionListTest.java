/*!
 *
 * This program is free software; you can redistribute it and/or modify it under the
 * terms of the GNU General Public License, version 2 as published by the Free Software
 * Foundation.
 *
 * You should have received a copy of the GNU General Public License along with this
 * program; if not, you can obtain a copy at http://www.gnu.org/licenses/gpl-2.0.html
 * or from the Free Software Foundation, Inc.,
 * 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
 * without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU General Public License for more details.
 *
 *
 * Copyright (c) 2002-2026 Hitachi Vantara. All rights reserved.
 *
 */

package org.pentaho.platform.engine.core.system.objfac;

import org.junit.After;
import org.junit.Test;

import java.io.Closeable;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.LinkedHashSet;
import java.util.Set;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/**
 * Unit test for {@link ClassicResolutionList} (de-OSGi migration &mdash; permanent forward-bridge skip list).
 */
public class ClassicResolutionListTest {

  private final Set<String> original = ClassicResolutionList.interfaces;

  @After
  public void tearDown() {
    ClassicResolutionList.interfaces = original;
    System.clearProperty( ClassicResolutionList.ADDITIONS_PROPERTY );
  }

  @Test
  public void bundledResourceSeedsTheTier1Set() {
    Set<String> loaded = ClassicResolutionList.load();
    // a representative sample of the list shipped in de-osgi-classic-interfaces.txt
    assertTrue( loaded.contains( "org.pentaho.platform.api.engine.IContentInfo" ) );           // Tier 1
    assertTrue( loaded.contains( "com.google.gwt.user.server.rpc.SerializationPolicy" ) );     // Tier 1
    assertTrue( loaded.contains( "org.pentaho.platform.plugin.action.olap.IOlapService" ) );   // Tier 1
    assertTrue( loaded.contains( "org.pentaho.platform.api.engine.ISystemConfig" ) );          // Tier 2
    assertTrue( loaded.contains( "org.springframework.security.core.userdetails.UserDetailsService" ) ); // Tier 3
    assertFalse( "Tier 4 (bundle-native) stays on OSGi",
      loaded.contains( "org.osgi.service.cm.ConfigurationAdmin" ) );
    assertEquals( "no comment / blank lines leak in", 22, loaded.size() );
  }

  @Test
  public void resolvesClassically_onlyForListedInterfaces() {
    ClassicResolutionList.interfaces = new LinkedHashSet<>( java.util.Arrays.asList( "java.io.Closeable" ) );

    assertTrue( ClassicResolutionList.resolvesClassically( Closeable.class ) );
    assertTrue( ClassicResolutionList.resolvesClassically( "java.io.Closeable" ) );
    assertFalse( ClassicResolutionList.resolvesClassically( Runnable.class ) );
    assertFalse( ClassicResolutionList.resolvesClassically( (Class<?>) null ) );
    assertFalse( ClassicResolutionList.resolvesClassically( (String) null ) );
  }

  @Test
  public void emptyListNeverForcesClassic() {
    ClassicResolutionList.interfaces = java.util.Collections.emptySet();
    assertFalse( ClassicResolutionList.resolvesClassically( Closeable.class ) );
  }

  @Test
  public void additionsPropertyIsMergedOnTopOfTheBundledList() {
    System.setProperty( ClassicResolutionList.ADDITIONS_PROPERTY, "com.acme.Foo, com.acme.Bar # note" );
    Set<String> loaded = ClassicResolutionList.load();
    assertTrue( loaded.contains( "com.acme.Foo" ) );
    assertTrue( loaded.contains( "com.acme.Bar" ) );
    assertTrue( "bundled entries still present", loaded.contains( "org.pentaho.platform.api.engine.IContentInfo" ) );
  }

  @Test
  public void addFrom_handlesNullEmptyDelimitersAndAtFile() throws Exception {
    Set<String> out = new LinkedHashSet<>();
    ClassicResolutionList.addFrom( out, null );
    ClassicResolutionList.addFrom( out, "   " );
    assertTrue( out.isEmpty() );

    ClassicResolutionList.addFrom( out, " a.B.C, d.E.F \n # comment\n g.H.I " );
    assertTrue( out.contains( "a.B.C" ) );
    assertTrue( out.contains( "g.H.I" ) );
    assertFalse( out.contains( "#" ) );

    File f = File.createTempFile( "classic-interfaces", ".txt" );
    f.deleteOnExit();
    Files.write( f.toPath(), "# h\norg.example.Alpha\n  org.example.Beta \n".getBytes( StandardCharsets.UTF_8 ) );
    ClassicResolutionList.addFrom( out, "@" + f.getAbsolutePath() );
    assertTrue( out.contains( "org.example.Alpha" ) );
    assertTrue( out.contains( "org.example.Beta" ) );

    // missing file must not propagate
    int before = out.size();
    ClassicResolutionList.addFrom( out, "@/no/such/classic/file.txt" );
    assertEquals( before, out.size() );
  }
}
