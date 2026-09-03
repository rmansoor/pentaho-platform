/*! ******************************************************************************
 *
 * Pentaho
 *
 * Copyright (C) 2026 by Pentaho Canada Inc. : http://www.pentaho.com
 *
 * Use of this software is governed by the Business Source License included
 * in the LICENSE.TXT file.
 *
 * Change Date: 2030-06-15
 ******************************************************************************/

package org.pentaho.platform.security.web.servlet.util;

import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletInputStream;

import java.io.ByteArrayInputStream;
import java.io.IOException;

/**
 * A {@link ServletInputStream} that replays a fixed byte buffer. Supports blocking reads and the
 * non-blocking {@link ReadListener} contract.
 * <p>
 * Clean-room replacement for {@code com.hitachivantara.security.web.impl.service.util.CachedServletInputStream}.
 */
public class CachedServletInputStream extends ServletInputStream {

  private final ByteArrayInputStream input;
  private ReadListener readListener;
  private boolean finished;

  public CachedServletInputStream( byte[] bytes ) {
    this.input = new ByteArrayInputStream( bytes != null ? bytes : new byte[ 0 ] );
  }

  @Override
  public boolean isFinished() {
    return finished;
  }

  @Override
  public boolean isReady() {
    return !finished;
  }

  @Override
  public void setReadListener( ReadListener readListener ) {
    this.readListener = readListener;
    try {
      if ( readListener != null ) {
        if ( input.available() > 0 ) {
          readListener.onDataAvailable();
        } else {
          markFinished();
        }
      }
    } catch ( IOException e ) {
      throw new RuntimeException( e );
    }
  }

  @Override
  public int read() throws IOException {
    int b = input.read();
    if ( b == -1 ) {
      markFinished();
    }
    return b;
  }

  @Override
  public int read( byte[] b, int off, int len ) throws IOException {
    int n = input.read( b, off, len );
    if ( n == -1 ) {
      markFinished();
    }
    return n;
  }

  @Override
  public int available() {
    return input.available();
  }

  @Override
  public long skip( long n ) {
    return input.skip( n );
  }

  @Override
  public void close() throws IOException {
    input.close();
  }

  @Override
  public boolean markSupported() {
    return true;
  }

  @Override
  public synchronized void mark( int readlimit ) {
    input.mark( readlimit );
  }

  @Override
  public synchronized void reset() {
    input.reset();
    finished = false;
  }

  private void markFinished() throws IOException {
    if ( !finished ) {
      finished = true;
      if ( readListener != null ) {
        readListener.onAllDataRead();
      }
    }
  }
}
