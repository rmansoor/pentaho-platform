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

package org.pentaho.platform.security.web.model.csrf;

import jakarta.servlet.http.HttpServletRequest;

/**
 * Effective CSRF protection state for the server.
 * <p>
 * Clean-room replacement for {@code com.hitachivantara.security.web.model.csrf.CsrfConfiguration}.
 */
public interface CsrfConfiguration {

  /** Whether CSRF protection is enabled at all. */
  boolean isEnabled();

  /** Whether CSRF protection applies to this specific request (enabled AND some request set matches). */
  boolean isEnabled( HttpServletRequest request );
}
