def generate_janus_config(num_streams=1, start_port=5001, output_file="janus.plugin.streaming.jcfg"):
    """
    Generate a Janus streaming plugin configuration file with specified number of streams.
    
    Args:
        num_streams (int): Number of streams to generate (default: 1 for testing)
        start_port (int): Starting port number (default: 5001)
        output_file (str): Output file name (default: janus.plugin.streaming.jcfg)
    """
    with open(output_file, 'w') as f:
        for i in range(1, num_streams + 1):
            stream_id = i
            mid = f"VT{str(stream_id).zfill(3)}"  # e.g., VT001
            port = start_port + (i - 1)  # e.g., 5001
            label = str(port)
            
            # Write stream configuration with consistent 4-space indentation
            f.write(f"multistream-{stream_id}:\n")
            f.write("    type = rtp\n")
            f.write(f"    description = Stream {stream_id}\n")
            f.write("    media = (\n")
            f.write("        {\n")
            f.write("            type = video\n")
            f.write(f"            port = {port}\n")
            f.write(f"            mid = {mid}\n")
            f.write(f"            label = {label}\n")
            f.write("            pt = 100\n")
            f.write("            codec = h264\n")
            f.write("        }\n")
            f.write("    )\n")
            f.write("\n")

if __name__ == "__main__":
    generate_janus_config(num_streams=1)  # Generate 1 stream for testing