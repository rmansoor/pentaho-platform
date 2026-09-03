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

package org.pentaho.platform.security.web.model.ssrf;

import java.net.URI;
import java.util.Set;

/**
 * SSRF protection state &mdash; the set of origins the server is allowed to consider "itself" when it
 * reflects request-supplied host information into a server-side fetch.
 * <p>
 * Clean-room replacement for {@code com.hitachivantara.security.web.model.ssrf.SsrfConfiguration}.
 */
public interface SsrfConfiguration {

  boolean isEnabled();

  Set<URI> getAllowedOrigins();
}
