import os

def generate_jcfg(num_streams, start_port=5001, pt=100, codec="h264", record=True, output_path="janus.plugin.streaming.jcfg"):
    header = '''general: {
    admin_key = "supersecret"
    events = true
    string_ids = false
}

'''
    config_blocks = []

    for i in range(1, num_streams + 1):
        stream_id = 1000 + i
        mid = f"v{i:03d}"
        label = f"{start_port + i - 1}"
        recfile = f"/opt/janus/recordings/stream-{label}-%Y%m%d%H%M%S.mjr"

        block = f'''multistream-{i:03d}: {{
    type = "rtp"
    id = {stream_id}
    description = "Camera {label}"
    media = (
        {{
            type = "video"
            mid = "{mid}"
            label = "{label}"
            port = {start_port + i - 1}
            pt = {pt}
            codec = "{codec}"
            record = {"true" if record else "false"}
            recfile = "{recfile}"
        }}
    )
}}

'''
        config_blocks.append(block)

    with open(output_path, "w") as f:
        f.write(header)
        f.writelines(config_blocks)

    print(f"✅ Generated {num_streams} stream configs in: {output_path}")


if __name__ == "__main__":
    try:
        n = int(input("Enter number of streams to generate (1–1000): "))
        if 1 <= n <= 1000:
            generate_jcfg(n)
        else:
            print("❌ Number must be between 1 and 1000.")
    except ValueError:
        print("❌ Invalid input. Please enter an integer.")
