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

import static junit.framework.Assert.assertEquals;

import static junit.framework.Assert.assertFalse;
import static junit.framework.Assert.assertTrue;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.mockito.Mockito;
import org.osgi.framework.Bundle;
import org.osgi.framework.ServiceReference;
import org.osgi.framework.Version;
import org.pentaho.platform.api.engine.IPentahoObjectReference;

import java.io.Closeable;
import java.util.Collections;
import java.util.HashSet;

/**
 * Unit test for {@link Phase0ServiceTrace} (de-OSGi migration Phase 0 instrumentation).
 */
public class Phase0ServiceTraceTest {

  private boolean originalEnabled;
  private java.util.Set<String> originalBlocklist;

  @Before
  public void setUp() {
    originalEnabled = Phase0ServiceTrace.enabled;
    originalBlocklist = Phase0ServiceTrace.blocklist;
    Phase0ServiceTrace.blocklist = Collections.emptySet();
    Phase0ServiceTrace.resetForTest();
  }

  @After
  public void tearDown() {
    Phase0ServiceTrace.enabled = originalEnabled;
    Phase0ServiceTrace.blocklist = originalBlocklist;
    Phase0ServiceTrace.resetForTest();
  }

  @Test
  public void disabledByDefault_recordsNothing() {
    Phase0ServiceTrace.enabled = false;
    Phase0ServiceTrace.record( Closeable.class, mockRef( "some.bundle", "1.0.0" ) );
    assertEquals( 0, Phase0ServiceTrace.seenCount() );
  }

  @Test
  public void whenEnabled_recordsDistinctResolutionsOnce() {
    Phase0ServiceTrace.enabled = true;

    ServiceReference<?> ref = mockRef( "pentaho-i18n-bundle", "10.1.0" );
    Phase0ServiceTrace.record( Closeable.class, ref );
    Phase0ServiceTrace.record( Closeable.class, ref );
    Phase0ServiceTrace.record( Closeable.class, ref );

    assertEquals( "same (iface, bundle) pair collapses to one entry", 1, Phase0ServiceTrace.seenCount() );

    Phase0ServiceTrace.record( Runnable.class, ref );
    assertEquals( "different interface is a new entry", 2, Phase0ServiceTrace.seenCount() );

    Phase0ServiceTrace.record( Closeable.class, mockRef( "other-bundle", "1.0.0" ) );
    assertEquals( "same interface, different bundle is a new entry", 3, Phase0ServiceTrace.seenCount() );
  }

  @Test
  public void skipsBridgeWrapperInterface() {
    Phase0ServiceTrace.enabled = true;
    Phase0ServiceTrace.record( IPentahoObjectReference.class, mockRef( "any", "1.0.0" ) );
    assertEquals( "the bridge's own wrapper interface is not a migration target", 0, Phase0ServiceTrace.seenCount() );
  }

  @Test
  public void nullSafe_neverThrows() {
    Phase0ServiceTrace.enabled = true;

    Phase0ServiceTrace.record( null, mockRef( "b", "1" ) );
    Phase0ServiceTrace.record( Closeable.class, null );

    ServiceReference<?> refNoBundle = Mockito.mock( ServiceReference.class );
    Mockito.when( refNoBundle.getBundle() ).thenReturn( null );
    Phase0ServiceTrace.record( Closeable.class, refNoBundle );

    ServiceReference<?> refThrows = Mockito.mock( ServiceReference.class );
    Mockito.when( refThrows.getBundle() ).thenThrow( new IllegalStateException( "bundle context invalid" ) );
    Phase0ServiceTrace.record( Closeable.class, refThrows );

    // No call threw. null class -> ignored; null ref and null bundle both collapse to the single
    // "Closeable|unknown|" key; the throwing ref is swallowed and adds nothing.
    assertEquals( 1, Phase0ServiceTrace.seenCount() );
  }

  @Test
  public void parseBlocklist_handlesNullEmptyAndDelimiters() {
    assertTrue( Phase0ServiceTrace.parseBlocklist( null ).isEmpty() );
    assertTrue( Phase0ServiceTrace.parseBlocklist( "   " ).isEmpty() );
    java.util.Set<String> parsed =
      Phase0ServiceTrace.parseBlocklist( " a.B.C, d.E.F \n g.H.I \t # a comment line\n j.K.L " );
    assertTrue( parsed.contains( "a.B.C" ) );
    assertTrue( parsed.contains( "g.H.I" ) );
    assertTrue( parsed.contains( "j.K.L" ) );
    assertFalse( parsed.contains( "#" ) );
  }

  @Test
  public void parseBlocklist_readsAtFileAndNeverThrows() throws Exception {
    java.io.File f = java.io.File.createTempFile( "phase0-blocklist", ".txt" );
    f.deleteOnExit();
    java.nio.file.Files.write( f.toPath(),
      "# header\norg.example.Alpha\n  org.example.Beta  \n".getBytes( java.nio.charset.StandardCharsets.UTF_8 ) );

    java.util.Set<String> parsed = Phase0ServiceTrace.parseBlocklist( "@" + f.getAbsolutePath() );
    assertTrue( parsed.contains( "org.example.Alpha" ) );
    assertTrue( parsed.contains( "org.example.Beta" ) );

    // a missing file must degrade to an empty set, not propagate
    assertTrue( Phase0ServiceTrace.parseBlocklist( "@/no/such/phase0/file.txt" ).isEmpty() );
  }

  @Test
  public void isBlocked_onlyForListedInterfaces() {
    Phase0ServiceTrace.blocklist = new HashSet<>( java.util.Arrays.asList( "java.io.Closeable" ) );

    assertTrue( Phase0ServiceTrace.isBlocked( Closeable.class ) );
    assertTrue( Phase0ServiceTrace.isBlocked( "java.io.Closeable" ) );
    assertFalse( Phase0ServiceTrace.isBlocked( Runnable.class ) );
    assertFalse( Phase0ServiceTrace.isBlocked( (Class<?>) null ) );
    assertFalse( Phase0ServiceTrace.isBlocked( (String) null ) );
  }

  @Test
  public void isBlocked_emptyListNeverBlocks() {
    Phase0ServiceTrace.blocklist = Collections.emptySet();
    assertFalse( Phase0ServiceTrace.isBlocked( Closeable.class ) );
  }

  private ServiceReference<?> mockRef( String symbolicName, String version ) {
    Bundle bundle = Mockito.mock( Bundle.class );
    Mockito.when( bundle.getSymbolicName() ).thenReturn( symbolicName );
    Mockito.when( bundle.getVersion() ).thenReturn( Version.parseVersion( version ) );
    Mockito.when( bundle.getBundleId() ).thenReturn( 42L );
    ServiceReference<?> ref = Mockito.mock( ServiceReference.class );
    Mockito.when( ref.getBundle() ).thenReturn( bundle );
    return ref;
  }
}
