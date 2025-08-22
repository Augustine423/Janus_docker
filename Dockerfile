# ---- Stage 1: Build Janus ----
FROM debian:bullseye-slim AS builder

ENV DEBIAN_FRONTEND=noninteractive
ENV INSTALL_DIR=/home/kzys
RUN apt-get update && apt-get install -y \
    build-essential git cmake pkg-config automake libtool gengetopt \
    libmicrohttpd-dev libjansson-dev libssl-dev libsrtp2-dev \
    libglib2.0-dev libopus-dev libogg-dev libcurl4-openssl-dev \
    libconfig-dev libnice-dev libwebsockets-dev libspeexdsp-dev \
    libavutil-dev libavcodec-dev libavformat-dev \
    liblua5.3-dev wget curl

WORKDIR ${INSTALL_DIR}

# Install usrsctp
RUN git clone https://github.com/sctplab/usrsctp.git && \
    cd usrsctp && ./bootstrap && ./configure && make && make install && ldconfig

# Install latest libsrtp
RUN wget https://github.com/cisco/libsrtp/archive/v2.5.0.tar.gz -O libsrtp-2.5.0.tar.gz && \
    tar xf libsrtp-2.5.0.tar.gz && cd libsrtp-2.5.0 && \
    ./configure --prefix=/usr && make && make install && ldconfig

# Clone and build Janus
RUN git clone https://github.com/meetecho/janus-gateway.git /janus && \
    cd /janus && \
    sh autogen.sh && \
    ./configure --prefix=/opt/janus \
    --enable-websockets \
    --disable-docs \
    --disable-data-channels \
    --disable-plugin-lua \
    --disable-sip \
    --disable-mqtt \
    --disable-rabbitmq \
    --enable-post-processing \
    --enable-recordings && \
    make -j$(nproc) && make install && make configs && \
    strip /opt/janus/bin/janus /opt/janus/bin/janus-* || true


# ---- Stage 2: Runtime Image ----
FROM debian:bullseye-slim

ENV DEBIAN_FRONTEND=noninteractive

# Minimal runtime deps + nginx
RUN apt-get update && apt-get install -y \
    libmicrohttpd12 libjansson4 libssl1.1 libsrtp2-1 \
    libglib2.0-0 libopus0 libogg0 libcurl4 \
    libconfig9 libnice10 libwebsockets16 libspeexdsp1 \
    nginx curl && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Copy built Janus
COPY --from=builder /opt/janus /opt/janus

# Setup janus folders
RUN mkdir -p /opt/janus/share/janus/recordings && \
    chmod 755 /opt/janus/share/janus/recordings && \
    chown root:root /opt/janus/share/janus/recordings

# Copy Janus configs
COPY janus.jcfg /opt/janus/etc/janus/janus.jcfg
COPY janus.plugin.videoroom.jcfg /opt/janus/etc/janus/janus.plugin.videoroom.jcfg
COPY janus.transport.pfunix.jcfg /opt/janus/etc/janus/janus.transport.pfunix.jcfg
COPY janus.transport.websockets.jcfg /opt/janus/etc/janus/janus.transport.websockets.jcfg
COPY janus.plugin.streaming.jcfg /opt/janus/etc/janus/janus.plugin.streaming.jcfg
COPY janus.transport.http.jcfg /opt/janus/etc/janus/janus.transport.http.jcfg

# Copy SSL certs
COPY combined_certificate.pem /etc/nginx/cert/combined_certificate.pem
COPY aioceaneye.key /etc/nginx/cert/aioceaneye.key

# Minimal TLS config for nginx (keeps default nginx.conf)
RUN rm -f /etc/nginx/sites-enabled/default
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy demo frontend files
RUN cp -r /opt/janus/share/janus/html/* /usr/share/nginx/html/

# Entrypoint
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 80 443 8088 8188 8989 5001-5500/udp

ENTRYPOINT ["/entrypoint.sh"]
CMD []
